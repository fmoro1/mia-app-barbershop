from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Request, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone, date, time
from pathlib import Path
import os
import uuid
import logging
import asyncio
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------- CONFIG ----------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'barbershop_db')
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = os.environ.get('JWT_ALGO', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', '43200'))
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'Barbershop <onboarding@resend.dev>')
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@barbershop.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin1234!')
BUSINESS_OPEN_HOUR = int(os.environ.get('BUSINESS_OPEN_HOUR', '9'))
BUSINESS_CLOSE_HOUR = int(os.environ.get('BUSINESS_CLOSE_HOUR', '19'))
SLOT_MINUTES = int(os.environ.get('SLOT_MINUTES', '30'))

# Optional integrations
try:
    import resend
    if RESEND_API_KEY:
        resend.api_key = RESEND_API_KEY
except Exception:
    resend = None

try:
    import stripe
    if STRIPE_SECRET_KEY:
        stripe.api_key = STRIPE_SECRET_KEY
except Exception:
    stripe = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

users_col = db.users
sessions_col = db.user_sessions
services_col = db.services
bookings_col = db.bookings
waitlist_col = db.waitlist

app = FastAPI(title="Barbershop API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("barbershop")

# ---------------- HELPERS ----------------
def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(p: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(p, hashed)
    except Exception:
        return False

def create_jwt(user_id: str) -> str:
    exp = now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)

async def get_user_from_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await users_col.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(user=Depends(get_user_from_token)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user

async def send_email_async(to: str, subject: str, html: str):
    if not RESEND_API_KEY or not resend:
        logger.info(f"[EMAIL-SKIPPED] to={to} subject={subject}")
        return
    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": RESEND_FROM, "to": [to], "subject": subject, "html": html
        })
    except Exception as e:
        logger.warning(f"Email send failed: {e}")

def clean_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name"),
        "phone": u.get("phone"),
        "role": u.get("role", "customer"),
        "providers": u.get("providers", []),
        "must_pay_online": u.get("must_pay_online", False),
        "blacklisted": u.get("blacklisted", False),
    }

# ---------------- MODELS ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    phone: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthIn(BaseModel):
    session_token: str  # from Emergent Google Auth flow

class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = ""
    duration_minutes: int = 30
    price_cents: int
    deposit_percent: int = 0
    active: bool = True

class BookingIn(BaseModel):
    service_id: str
    start_at: datetime  # ISO datetime
    notes: Optional[str] = ""
    reminder_hours_before: Optional[int] = 24  # user picks when reminder is sent (24=day before, 2=same day)

class BookingUpdate(BaseModel):
    start_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None  # confirmed, cancelled, completed, no_show
    notes: Optional[str] = None

class WaitlistIn(BaseModel):
    service_id: str
    desired_date: str  # YYYY-MM-DD
    notes: Optional[str] = ""

class ClientAdminUpdate(BaseModel):
    must_pay_online: Optional[bool] = None
    blacklisted: Optional[bool] = None

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

class PayIntentIn(BaseModel):
    booking_id: str

# ---------------- STARTUP ----------------
@app.on_event("startup")
async def startup():
    await users_col.create_index("email", unique=True)
    await users_col.create_index("user_id", unique=True)
    await sessions_col.create_index("session_token", unique=True)
    await services_col.create_index("service_id", unique=True)
    await bookings_col.create_index("booking_id", unique=True)
    await bookings_col.create_index([("start_at", 1)])
    await waitlist_col.create_index("waitlist_id", unique=True)

    # Seed admin
    existing = await users_col.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await users_col.insert_one({
            "user_id": new_id("usr"),
            "email": ADMIN_EMAIL.lower(),
            "name": "Admin",
            "phone": None,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "providers": ["local"],
            "must_pay_online": False,
            "blacklisted": False,
            "created_at": now_utc(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")

    # Seed services
    count = await services_col.count_documents({})
    if count == 0:
        base_services = [
            {"name": "Taglio Uomo", "description": "Taglio classico o moderno", "duration_minutes": 45, "price_cents": 1500, "deposit_percent": 0},
            {"name": "Combo (Taglio e Barba)", "description": "Servizio completo taglio + barba", "duration_minutes": 60, "price_cents": 2000, "deposit_percent": 0},
            {"name": "Sfumatura", "description": "Sfumatura precisa a macchinetta", "duration_minutes": 30, "price_cents": 1200, "deposit_percent": 0},
            {"name": "Rasatura a Macchinetta", "description": "Rasatura rapida", "duration_minutes": 15, "price_cents": 500, "deposit_percent": 0},
            {"name": "Shampoo e Taglio Uomo", "description": "Shampoo + taglio", "duration_minutes": 45, "price_cents": 1700, "deposit_percent": 0},
            {"name": "Barba", "description": "Regolazione o rasatura barba", "duration_minutes": 30, "price_cents": 500, "deposit_percent": 0},
            {"name": "Trattamento Cute e Capello", "description": "Trattamento specifico per cute e capelli", "duration_minutes": 30, "price_cents": 500, "deposit_percent": 0},
            {"name": "Taglio Bambini e Teenager", "description": "Taglio dedicato ai più giovani", "duration_minutes": 30, "price_cents": 1200, "deposit_percent": 0},
        ]
        for s in base_services:
            await services_col.insert_one({
                "service_id": new_id("srv"), **s, "active": True, "created_at": now_utc(),
            })
        logger.info("Seeded default services")

    # Start reminder scheduler (background loop)
    asyncio.create_task(reminder_loop())

# ---------------- AUTH ROUTES ----------------
@api.post("/auth/register")
async def register(data: RegisterIn):
    existing = await users_col.find_one({"email": data.email.lower()})
    if existing and existing.get("password_hash"):
        raise HTTPException(status_code=409, detail="Email già registrata")
    if existing:
        await users_col.update_one({"email": data.email.lower()}, {
            "$set": {"password_hash": hash_password(data.password), "name": data.name, "phone": data.phone},
            "$addToSet": {"providers": "local"},
        })
        user = await users_col.find_one({"email": data.email.lower()})
    else:
        user = {
            "user_id": new_id("usr"),
            "email": data.email.lower(),
            "name": data.name,
            "phone": data.phone,
            "password_hash": hash_password(data.password),
            "role": "customer",
            "providers": ["local"],
            "must_pay_online": False,
            "blacklisted": False,
            "created_at": now_utc(),
        }
        await users_col.insert_one(user)
    token = create_jwt(user["user_id"])
    return {"access_token": token, "user": clean_user(user)}

@api.post("/auth/login")
async def login(data: LoginIn):
    user = await users_col.find_one({"email": data.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if user.get("blacklisted"):
        raise HTTPException(status_code=403, detail="Account non abilitato. Contatta il salone.")
    token = create_jwt(user["user_id"])
    return {"access_token": token, "user": clean_user(user)}

@api.post("/auth/google")
async def google_auth(data: GoogleAuthIn):
    """Verify Emergent Google Auth session_token and return JWT."""
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": data.session_token},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Google auth failed")
        info = r.json()
        email = info.get("email", "").lower()
        name = info.get("name") or email.split("@")[0]
        if not email:
            raise HTTPException(status_code=401, detail="Google auth: no email")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google auth error: {e}")

    user = await users_col.find_one({"email": email})
    if user:
        await users_col.update_one({"email": email}, {
            "$addToSet": {"providers": "google"},
            "$set": {"name": user.get("name") or name},
        })
        user = await users_col.find_one({"email": email})
    else:
        user = {
            "user_id": new_id("usr"),
            "email": email,
            "name": name,
            "phone": None,
            "password_hash": None,
            "role": "customer",
            "providers": ["google"],
            "must_pay_online": False,
            "blacklisted": False,
            "created_at": now_utc(),
        }
        await users_col.insert_one(user)
    if user.get("blacklisted"):
        raise HTTPException(status_code=403, detail="Account non abilitato")
    token = create_jwt(user["user_id"])
    return {"access_token": token, "user": clean_user(user)}

@api.get("/auth/me")
async def me(user=Depends(get_user_from_token)):
    return clean_user(user)

@api.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user=Depends(get_user_from_token)):
    full = await users_col.find_one({"user_id": user["user_id"]})
    if not full or not full.get("password_hash"):
        raise HTTPException(status_code=400, detail="Nessuna password impostata (accesso via Google). Contatta il salone.")
    if not verify_password(data.current_password, full["password_hash"]):
        raise HTTPException(status_code=401, detail="Password attuale errata")
    await users_col.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}},
    )
    return {"ok": True}

# ---------------- SERVICES ----------------
@api.get("/services")
async def list_services():
    items = await services_col.find({"active": True}, {"_id": 0}).to_list(500)
    return items

@api.post("/admin/services")
async def create_service(data: ServiceIn, user=Depends(require_admin)):
    doc = {"service_id": new_id("srv"), **data.model_dump(), "created_at": now_utc()}
    await services_col.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/admin/services/{service_id}")
async def update_service(service_id: str, data: ServiceIn, user=Depends(require_admin)):
    await services_col.update_one({"service_id": service_id}, {"$set": data.model_dump()})
    doc = await services_col.find_one({"service_id": service_id}, {"_id": 0})
    return doc

@api.delete("/admin/services/{service_id}")
async def delete_service(service_id: str, user=Depends(require_admin)):
    await services_col.update_one({"service_id": service_id}, {"$set": {"active": False}})
    return {"ok": True}

# ---------------- AVAILABILITY ----------------
def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()

@api.get("/availability")
async def availability(date_str: str = Query(..., alias="date"), service_id: Optional[str] = None):
    """Return list of slots for a given date. Each slot: {start, end, available}."""
    d = parse_date(date_str)
    duration = SLOT_MINUTES
    if service_id:
        svc = await services_col.find_one({"service_id": service_id}, {"_id": 0})
        if svc:
            duration = int(svc.get("duration_minutes", SLOT_MINUTES))

    # Existing bookings for this day (not cancelled)
    day_start = datetime.combine(d, time(0, 0), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    existing = await bookings_col.find({
        "start_at": {"$gte": day_start, "$lt": day_end},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).to_list(500)

    slots = []
    open_dt = datetime.combine(d, time(BUSINESS_OPEN_HOUR, 0), tzinfo=timezone.utc)
    close_dt = datetime.combine(d, time(BUSINESS_CLOSE_HOUR, 0), tzinfo=timezone.utc)
    cursor = open_dt
    while cursor + timedelta(minutes=duration) <= close_dt:
        slot_start = cursor
        slot_end = cursor + timedelta(minutes=duration)
        conflict = False
        for b in existing:
            bs = b["start_at"]
            if isinstance(bs, str):
                bs = datetime.fromisoformat(bs)
            if bs.tzinfo is None:
                bs = bs.replace(tzinfo=timezone.utc)
            be = bs + timedelta(minutes=int(b.get("duration_minutes", SLOT_MINUTES)))
            if slot_start < be and slot_end > bs:
                conflict = True
                break
        slots.append({
            "start": to_iso(slot_start),
            "end": to_iso(slot_end),
            "available": not conflict,
        })
        cursor += timedelta(minutes=SLOT_MINUTES)
    all_full = all(not s["available"] for s in slots) if slots else True
    return {"date": date_str, "slots": slots, "all_full": all_full}

# ---------------- BOOKINGS ----------------
@api.post("/bookings")
async def create_booking(data: BookingIn, user=Depends(get_user_from_token)):
    if user.get("blacklisted"):
        raise HTTPException(status_code=403, detail="Non puoi prenotare. Contatta il salone.")
    svc = await services_col.find_one({"service_id": data.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=404, detail="Servizio non trovato")

    start_at = data.start_at
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)
    duration = int(svc["duration_minutes"])
    end_at = start_at + timedelta(minutes=duration)

    # Check conflict
    day_start = datetime.combine(start_at.date(), time(0, 0), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    same_day = await bookings_col.find({
        "start_at": {"$gte": day_start, "$lt": day_end},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).to_list(500)
    for b in same_day:
        bs = b["start_at"]
        if bs.tzinfo is None:
            bs = bs.replace(tzinfo=timezone.utc)
        be = bs + timedelta(minutes=int(b.get("duration_minutes", SLOT_MINUTES)))
        if start_at < be and end_at > bs:
            raise HTTPException(status_code=409, detail="Orario non disponibile")

    total = int(svc["price_cents"])
    must_online = bool(user.get("must_pay_online")) or int(svc.get("deposit_percent", 0)) > 0
    deposit = int(total * int(svc.get("deposit_percent", 0)) / 100)

    booking = {
        "booking_id": new_id("bkg"),
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "user_email": user["email"],
        "service_id": data.service_id,
        "service_name": svc["name"],
        "start_at": start_at,
        "duration_minutes": duration,
        "notes": data.notes or "",
        "reminder_hours_before": int(data.reminder_hours_before or 24),
        "reminder_sent": False,
        "same_day_reminder_sent": False,
        "status": "confirmed",
        "total_cents": total,
        "deposit_cents": deposit,
        "must_pay_online": must_online,
        "payment_status": "unpaid",
        "stripe_payment_intent_id": None,
        "created_at": now_utc(),
    }
    await bookings_col.insert_one(booking)

    # Confirmation email
    asyncio.create_task(send_email_async(
        user["email"],
        f"Prenotazione confermata - {svc['name']}",
        f"<h2>Ciao {user.get('name','')}</h2><p>La tua prenotazione per <b>{svc['name']}</b> è confermata per il <b>{start_at.strftime('%d/%m/%Y alle %H:%M')}</b>.</p>",
    ))

    booking.pop("_id", None)
    booking["start_at"] = to_iso(start_at)
    return booking

@api.get("/bookings/mine")
async def my_bookings(user=Depends(get_user_from_token)):
    items = await bookings_col.find({"user_id": user["user_id"]}, {"_id": 0}).sort("start_at", -1).to_list(200)
    for i in items:
        if isinstance(i.get("start_at"), datetime):
            i["start_at"] = to_iso(i["start_at"])
    return items

@api.patch("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user=Depends(get_user_from_token)):
    b = await bookings_col.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")
    if b["user_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await bookings_col.update_one({"booking_id": booking_id}, {"$set": {"status": "cancelled"}})
    # Notify waitlist for that date
    asyncio.create_task(notify_waitlist_for_slot(b))
    return {"ok": True}

# ---------------- ADMIN BOOKINGS ----------------
@api.get("/admin/bookings")
async def admin_list_bookings(date_str: Optional[str] = Query(None, alias="date"), user=Depends(require_admin)):
    query = {}
    if date_str:
        d = parse_date(date_str)
        day_start = datetime.combine(d, time(0, 0), tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        query["start_at"] = {"$gte": day_start, "$lt": day_end}
    items = await bookings_col.find(query, {"_id": 0}).sort("start_at", 1).to_list(500)
    for i in items:
        if isinstance(i.get("start_at"), datetime):
            i["start_at"] = to_iso(i["start_at"])
    return items

@api.patch("/admin/bookings/{booking_id}")
async def admin_update_booking(booking_id: str, data: BookingUpdate, user=Depends(require_admin)):
    b = await bookings_col.find_one({"booking_id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")
    upd = {}
    if data.start_at is not None:
        sa = data.start_at
        if sa.tzinfo is None:
            sa = sa.replace(tzinfo=timezone.utc)
        upd["start_at"] = sa
    if data.duration_minutes is not None:
        upd["duration_minutes"] = int(data.duration_minutes)
    if data.status is not None:
        upd["status"] = data.status
    if data.notes is not None:
        upd["notes"] = data.notes
    if upd:
        await bookings_col.update_one({"booking_id": booking_id}, {"$set": upd})
    if data.status == "cancelled":
        asyncio.create_task(notify_waitlist_for_slot(b))
    return {"ok": True}

# ---------------- WAITLIST ----------------
@api.post("/waitlist")
async def join_waitlist(data: WaitlistIn, user=Depends(get_user_from_token)):
    svc = await services_col.find_one({"service_id": data.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=404, detail="Servizio non trovato")
    doc = {
        "waitlist_id": new_id("wl"),
        "user_id": user["user_id"],
        "user_email": user["email"],
        "user_name": user.get("name"),
        "service_id": data.service_id,
        "service_name": svc["name"],
        "desired_date": data.desired_date,
        "notes": data.notes or "",
        "notified": False,
        "created_at": now_utc(),
    }
    await waitlist_col.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/waitlist/mine")
async def my_waitlist(user=Depends(get_user_from_token)):
    items = await waitlist_col.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api.delete("/waitlist/{waitlist_id}")
async def leave_waitlist(waitlist_id: str, user=Depends(get_user_from_token)):
    w = await waitlist_col.find_one({"waitlist_id": waitlist_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Non trovato")
    if w["user_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await waitlist_col.delete_one({"waitlist_id": waitlist_id})
    return {"ok": True}

@api.get("/admin/waitlist")
async def admin_waitlist(user=Depends(require_admin)):
    items = await waitlist_col.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items

async def notify_waitlist_for_slot(cancelled_booking: dict):
    """When a booking is cancelled, notify waitlist users for that date."""
    sa = cancelled_booking.get("start_at")
    if not sa:
        return
    if isinstance(sa, str):
        try:
            sa = datetime.fromisoformat(sa)
        except Exception:
            return
    date_str = sa.strftime("%Y-%m-%d")
    matches = await waitlist_col.find({
        "desired_date": date_str,
        "service_id": cancelled_booking.get("service_id"),
        "notified": False,
    }, {"_id": 0}).to_list(50)
    for w in matches:
        await waitlist_col.update_one({"waitlist_id": w["waitlist_id"]}, {"$set": {"notified": True, "notified_at": now_utc()}})
        # In-app notification is fetched via GET /waitlist/mine (notified=true)
        await send_email_async(
            w["user_email"],
            f"Posto libero il {date_str} - Barbershop",
            f"<h2>Buone notizie {w.get('user_name','')}!</h2><p>Si è liberato un posto per <b>{w['service_name']}</b> il <b>{date_str}</b>. Apri l'app per prenotare.</p>",
        )

# ---------------- ADMIN CLIENTS ----------------
@api.get("/admin/clients")
async def admin_clients(q: Optional[str] = None, user=Depends(require_admin)):
    query = {"role": "customer"}
    if q:
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    items = await users_col.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return items

@api.patch("/admin/clients/{user_id}")
async def admin_update_client(user_id: str, data: ClientAdminUpdate, user=Depends(require_admin)):
    upd = {}
    if data.must_pay_online is not None:
        upd["must_pay_online"] = bool(data.must_pay_online)
    if data.blacklisted is not None:
        upd["blacklisted"] = bool(data.blacklisted)
    if upd:
        await users_col.update_one({"user_id": user_id}, {"$set": upd})
    u = await users_col.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return u

# ---------------- PAYMENTS ----------------
@api.post("/payments/create-intent")
async def create_payment_intent(data: PayIntentIn, user=Depends(get_user_from_token)):
    if not stripe or not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Pagamenti non disponibili")
    b = await bookings_col.find_one({"booking_id": data.booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Prenotazione non trovata")
    if b["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    amount = int(b.get("deposit_cents") or 0) or int(b["total_cents"])
    try:
        pi = stripe.PaymentIntent.create(
            amount=amount,
            currency="eur",
            automatic_payment_methods={"enabled": True},
            metadata={"booking_id": data.booking_id},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e}")
    await bookings_col.update_one({"booking_id": data.booking_id}, {"$set": {"stripe_payment_intent_id": pi.id}})
    return {"client_secret": pi.client_secret, "amount": amount, "currency": "eur"}

# ---------------- REMINDER LOOP ----------------
async def reminder_loop():
    """Every 5 minutes, check bookings needing reminders."""
    await asyncio.sleep(10)
    while True:
        try:
            now = now_utc()
            upcoming = await bookings_col.find({
                "status": "confirmed",
                "start_at": {"$gte": now, "$lt": now + timedelta(days=3)},
            }, {"_id": 0}).to_list(500)
            for b in upcoming:
                sa = b["start_at"]
                if isinstance(sa, str):
                    sa = datetime.fromisoformat(sa)
                if sa.tzinfo is None:
                    sa = sa.replace(tzinfo=timezone.utc)
                hours_left = (sa - now).total_seconds() / 3600.0
                rh = int(b.get("reminder_hours_before", 24))
                # Custom reminder (day before / user choice)
                if not b.get("reminder_sent") and hours_left <= rh and hours_left > 0:
                    await send_email_async(
                        b["user_email"],
                        f"Promemoria: {b['service_name']} tra {int(hours_left)}h",
                        f"<h3>Promemoria appuntamento</h3><p>Ti aspettiamo per <b>{b['service_name']}</b> il <b>{sa.strftime('%d/%m/%Y alle %H:%M')}</b>.</p>",
                    )
                    await bookings_col.update_one({"booking_id": b["booking_id"]}, {"$set": {"reminder_sent": True}})
                # Same-day reminder (2 hours before) - always
                if not b.get("same_day_reminder_sent") and 0 < hours_left <= 2:
                    await send_email_async(
                        b["user_email"],
                        f"Ci vediamo tra poco - {b['service_name']}",
                        f"<h3>A tra poco!</h3><p>Il tuo appuntamento è alle <b>{sa.strftime('%H:%M')}</b>.</p>",
                    )
                    await bookings_col.update_one({"booking_id": b["booking_id"]}, {"$set": {"same_day_reminder_sent": True}})
        except Exception as e:
            logger.warning(f"reminder_loop error: {e}")
        await asyncio.sleep(300)

# ---------------- MOUNT ----------------
@api.get("/")
async def root():
    return {"ok": True, "app": "Barbershop API"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
