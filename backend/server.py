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
from zoneinfo import ZoneInfo
from pathlib import Path
import os
import uuid
import logging
import asyncio
import httpx

TZ = ZoneInfo("Europe/Rome")

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

# Push notifications
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get('EMERGENT_PUSH_KEY', 'placeholder')
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

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
settings_col = db.settings
timeoff_col = db.time_off
notifications_col = db.admin_notifications

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

async def create_admin_notification(kind: str, title: str, body: str, meta: Optional[dict] = None):
    """Insert an admin-facing notification (in-app bell feed)."""
    await notifications_col.insert_one({
        "notif_id": new_id("ntf"),
        "kind": kind,
        "title": title,
        "body": body,
        "meta": meta or {},
        "read": False,
        "created_at": now_utc(),
    })

async def send_push(recipients: list, data: dict, idempotency_key: Optional[str] = None) -> None:
    """Send a push notification via Emergent-managed push service."""
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise RuntimeError("EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise RuntimeError("Push provider unavailable")
    resp.raise_for_status()

async def notify_admins_push(title: str, message: str, meta: Optional[dict] = None):
    """Send push to all admin users. Non-blocking."""
    try:
        admin_ids = [u["user_id"] async for u in users_col.find({"role": "admin"}, {"_id": 0, "user_id": 1})]
        if not admin_ids:
            return
        data = {"title": title, "message": message}
        if meta:
            data.update({k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))})
        await send_push(admin_ids, data)
    except Exception as e:
        logger.warning(f"Push notification failed (non-blocking): {e}")

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

class AdminBookingCreate(BaseModel):
    service_id: str
    start_at: datetime
    user_id: Optional[str] = None  # existing customer (optional)
    walk_in_name: Optional[str] = None  # else walk-in name
    walk_in_phone: Optional[str] = None  # walk-in phone
    walk_in_email: Optional[str] = None  # walk-in email
    notes: Optional[str] = ""

class BookingUpdate(BaseModel):
    start_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None  # confirmed, cancelled, completed, no_show
    notes: Optional[str] = None

class WaitlistIn(BaseModel):
    service_id: str
    desired_date: str  # YYYY-MM-DD
    preferred_slot: Literal["morning", "afternoon", "any"] = "any"
    notes: Optional[str] = ""

class ClientAdminUpdate(BaseModel):
    must_pay_online: Optional[bool] = None
    blacklisted: Optional[bool] = None

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str

# Weekly schedule: keys "0"-"6" (0=Mon, 6=Sun), value = list of [HH:MM, HH:MM] windows.
class WeeklyScheduleIn(BaseModel):
    weekly: dict  # {"0": [["09:00","12:30"],["14:00","19:30"]], ...}

class TimeOffIn(BaseModel):
    date_from: str  # YYYY-MM-DD
    date_to: str    # YYYY-MM-DD inclusive
    type: Literal["closed", "open"] = "closed"
    time_from: Optional[str] = None  # "HH:MM"; null = whole day
    time_to: Optional[str] = None
    reason: Optional[str] = ""

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
    await timeoff_col.create_index("time_off_id", unique=True)
    await notifications_col.create_index("notif_id", unique=True)
    await notifications_col.create_index([("created_at", -1)])

    # Seed default weekly schedule if missing
    existing_sched = await settings_col.find_one({"_id": "business_schedule"})
    if not existing_sched:
        default_weekly = {
            "0": [],  # Monday - closed
            "1": [["09:00", "12:30"], ["14:00", "19:30"]],  # Tuesday
            "2": [["09:00", "12:30"], ["14:00", "19:30"]],  # Wednesday
            "3": [["09:00", "12:30"], ["14:00", "19:30"]],  # Thursday
            "4": [["09:00", "12:30"], ["14:00", "19:30"]],  # Friday
            "5": [["09:00", "12:30"], ["14:00", "19:30"]],  # Saturday
            "6": [],  # Sunday - closed
        }
        await settings_col.insert_one({"_id": "business_schedule", "weekly": default_weekly})
        logger.info("Seeded default weekly schedule")

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

@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            raise HTTPException(status_code=500, detail="EMERGENT_PUSH_KEY missing or invalid")
        if resp.status_code >= 500:
            raise HTTPException(status_code=502, detail="Push provider unavailable")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"register-push failed: {e}")
        raise HTTPException(status_code=502, detail="Push registration failed")
    return {"status": "registered"}

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
    """Return list of slots for a given date, computed from weekly schedule + time_off overrides."""
    d = parse_date(date_str)
    duration = SLOT_MINUTES
    if service_id:
        svc = await services_col.find_one({"service_id": service_id}, {"_id": 0})
        if svc:
            duration = int(svc.get("duration_minutes", SLOT_MINUTES))

    windows = await get_open_windows_for_date(d)

    # Existing bookings for this day (not cancelled) - query in Italian TZ range
    day_start_local = datetime.combine(d, time(0, 0), tzinfo=TZ)
    day_end_local = day_start_local + timedelta(days=1)
    day_start = day_start_local.astimezone(timezone.utc)
    day_end = day_end_local.astimezone(timezone.utc)
    existing = await bookings_col.find({
        "start_at": {"$gte": day_start, "$lt": day_end},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).to_list(500)

    slots = []
    for w_start, w_end in windows:
        cursor = datetime.combine(d, w_start, tzinfo=TZ)
        window_end_dt = datetime.combine(d, w_end, tzinfo=TZ)
        while cursor + timedelta(minutes=duration) <= window_end_dt:
            slot_start = cursor
            slot_end = cursor + timedelta(minutes=duration)
            conflict = False
            for b in existing:
                bs = b["start_at"]
                if isinstance(bs, str):
                    bs = datetime.fromisoformat(bs)
                if bs.tzinfo is None:
                    bs = bs.replace(tzinfo=timezone.utc)
                bs_local = bs.astimezone(TZ)
                be_local = bs_local + timedelta(minutes=int(b.get("duration_minutes", SLOT_MINUTES)))
                if slot_start < be_local and slot_end > bs_local:
                    conflict = True
                    break
            slots.append({
                "start": slot_start.isoformat(),
                "end": slot_end.isoformat(),
                "available": not conflict,
            })
            cursor += timedelta(minutes=SLOT_MINUTES)

    closed_all_day = len(windows) == 0
    all_full = closed_all_day or (bool(slots) and all(not s["available"] for s in slots))
    return {"date": date_str, "slots": slots, "all_full": all_full, "closed": closed_all_day}


def _parse_hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))
async def get_open_windows_for_date(d: date):
    """Return list of (time_start, time_end) open windows for the given date, applying overrides."""
    # Python weekday: 0=Mon .. 6=Sun (matches our storage keys)
    dow = str(d.weekday())
    sched = await settings_col.find_one({"_id": "business_schedule"})
    weekly = (sched or {}).get("weekly", {})
    day_windows = weekly.get(dow, [])
    # Convert to time tuples
    windows = [(_parse_hhmm(a), _parse_hhmm(b)) for a, b in day_windows]

    # Apply time_off overrides for this exact date range
    date_iso = d.strftime("%Y-%m-%d")
    overrides = await timeoff_col.find({
        "date_from": {"$lte": date_iso},
        "date_to": {"$gte": date_iso},
    }, {"_id": 0}).to_list(200)

    for o in overrides:
        t_from = _parse_hhmm(o["time_from"]) if o.get("time_from") else time(0, 0)
        t_to = _parse_hhmm(o["time_to"]) if o.get("time_to") else time(23, 59)
        if o.get("type") == "open":
            # Add this window (merge later)
            windows.append((t_from, t_to))
        else:
            # closed: subtract this range from all windows
            new_wins = []
            for w_start, w_end in windows:
                # If no overlap → keep as-is
                if t_to <= w_start or t_from >= w_end:
                    new_wins.append((w_start, w_end))
                    continue
                # Overlap: split
                if t_from > w_start:
                    new_wins.append((w_start, t_from))
                if t_to < w_end:
                    new_wins.append((t_to, w_end))
            windows = new_wins

    # Merge overlapping / adjacent windows
    windows.sort()
    merged = []
    for w in windows:
        if merged and w[0] <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], w[1]))
        else:
            merged.append(w)
    return merged

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
        # Interpret as Italian local time
        start_at = start_at.replace(tzinfo=TZ)
    else:
        start_at = start_at.astimezone(TZ)
    duration = int(svc["duration_minutes"])
    end_at = start_at + timedelta(minutes=duration)

    # Check conflict - convert to UTC for MongoDB range query
    day_start_local = datetime.combine(start_at.date(), time(0, 0), tzinfo=TZ)
    day_end_local = day_start_local + timedelta(days=1)
    day_start = day_start_local.astimezone(timezone.utc)
    day_end = day_end_local.astimezone(timezone.utc)
    same_day = await bookings_col.find({
        "start_at": {"$gte": day_start, "$lt": day_end},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).to_list(500)
    for b in same_day:
        bs = b["start_at"]
        if bs.tzinfo is None:
            bs = bs.replace(tzinfo=timezone.utc)
        bs = bs.astimezone(TZ)
        be = bs + timedelta(minutes=int(b.get("duration_minutes", SLOT_MINUTES)))
        if start_at < be and end_at > bs:
            raise HTTPException(status_code=409, detail="Orario non disponibile")

    total = int(svc["price_cents"])
    must_online = bool(user.get("must_pay_online")) or int(svc.get("deposit_percent", 0)) > 0
    deposit = int(total * int(svc.get("deposit_percent", 0)) / 100)

    # Verify slot is within an open window for that date
    windows = await get_open_windows_for_date(start_at.date())
    slot_ok = False
    for w_start, w_end in windows:
        w_start_dt = datetime.combine(start_at.date(), w_start, tzinfo=TZ)
        w_end_dt = datetime.combine(start_at.date(), w_end, tzinfo=TZ)
        if start_at >= w_start_dt and end_at <= w_end_dt:
            slot_ok = True
            break
    if not slot_ok:
        raise HTTPException(status_code=400, detail="Orario fuori dall'apertura del salone")

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

    # Admin in-app notification
    start_it = start_at.astimezone(TZ)
    asyncio.create_task(create_admin_notification(
        kind="new_booking",
        title="Nuova prenotazione",
        body=f"{user.get('name') or user['email']} ha prenotato {svc['name']} il {start_it.strftime('%d/%m/%Y alle %H:%M')}",
        meta={"booking_id": booking["booking_id"], "start_at": start_it.isoformat(), "service_name": svc["name"], "user_email": user["email"]},
    ))

    # Push notification to admin device(s)
    asyncio.create_task(notify_admins_push(
        title="Nuova prenotazione",
        message=f"{user.get('name') or user['email']} — {svc['name']} il {start_it.strftime('%d/%m alle %H:%M')}",
        meta={"action_url": "/admin/diary"},
    ))

    # Confirmation email
    asyncio.create_task(send_email_async(
        user["email"],
        f"Prenotazione confermata - {svc['name']}",
        f"<h2>Ciao {user.get('name','')}</h2><p>La tua prenotazione per <b>{svc['name']}</b> è confermata per il <b>{start_it.strftime('%d/%m/%Y alle %H:%M')}</b>.</p>",
    ))

    booking.pop("_id", None)
    booking["start_at"] = start_at.isoformat()
    return booking

@api.get("/bookings/mine")
async def my_bookings(user=Depends(get_user_from_token)):
    items = await bookings_col.find({"user_id": user["user_id"]}, {"_id": 0}).sort("start_at", -1).to_list(200)
    for i in items:
        if isinstance(i.get("start_at"), datetime):
            dt = i["start_at"]
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            i["start_at"] = dt.astimezone(TZ).isoformat()
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
@api.post("/admin/bookings")
async def admin_create_booking(data: AdminBookingCreate, user=Depends(require_admin)):
    """Admin creates a booking on behalf of a customer (existing user or walk-in)."""
    svc = await services_col.find_one({"service_id": data.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=404, detail="Servizio non trovato")

    start_at = data.start_at
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=TZ)
    else:
        start_at = start_at.astimezone(TZ)
    duration = int(svc["duration_minutes"])
    end_at = start_at + timedelta(minutes=duration)

    # Resolve customer info
    target_user_id: Optional[str] = None
    cust_name: str = ""
    cust_email: str = ""
    cust_phone: Optional[str] = None
    if data.user_id:
        u = await users_col.find_one({"user_id": data.user_id}, {"_id": 0, "password_hash": 0})
        if not u:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        target_user_id = u["user_id"]
        cust_name = u.get("name") or u["email"]
        cust_email = u["email"]
        cust_phone = u.get("phone")
    else:
        if not (data.walk_in_name or data.walk_in_phone):
            raise HTTPException(status_code=400, detail="Fornisci un cliente esistente o nome/telefono walk-in")
        cust_name = data.walk_in_name or "Walk-in"
        cust_email = data.walk_in_email or ""
        cust_phone = data.walk_in_phone

    # Conflict check
    day_start_local = datetime.combine(start_at.date(), time(0, 0), tzinfo=TZ)
    day_end_local = day_start_local + timedelta(days=1)
    same_day = await bookings_col.find({
        "start_at": {"$gte": day_start_local.astimezone(timezone.utc), "$lt": day_end_local.astimezone(timezone.utc)},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).to_list(500)
    for b in same_day:
        bs = b["start_at"]
        if bs.tzinfo is None:
            bs = bs.replace(tzinfo=timezone.utc)
        bs = bs.astimezone(TZ)
        be = bs + timedelta(minutes=int(b.get("duration_minutes", SLOT_MINUTES)))
        if start_at < be and end_at > bs:
            raise HTTPException(status_code=409, detail="Orario non disponibile")

    # Verify open window
    windows = await get_open_windows_for_date(start_at.date())
    slot_ok = any(
        start_at >= datetime.combine(start_at.date(), w[0], tzinfo=TZ)
        and end_at <= datetime.combine(start_at.date(), w[1], tzinfo=TZ)
        for w in windows
    )
    if not slot_ok:
        raise HTTPException(status_code=400, detail="Orario fuori dall'apertura del salone")

    booking = {
        "booking_id": new_id("bkg"),
        "user_id": target_user_id,
        "user_name": cust_name,
        "user_email": cust_email,
        "user_phone": cust_phone,
        "walk_in": target_user_id is None,
        "service_id": data.service_id,
        "service_name": svc["name"],
        "start_at": start_at,
        "duration_minutes": duration,
        "notes": data.notes or "",
        "reminder_hours_before": 24,
        "reminder_sent": False,
        "same_day_reminder_sent": False,
        "status": "confirmed",
        "total_cents": int(svc["price_cents"]),
        "deposit_cents": 0,
        "must_pay_online": False,
        "payment_status": "unpaid",
        "stripe_payment_intent_id": None,
        "created_at": now_utc(),
        "created_by_admin": user["user_id"],
    }
    await bookings_col.insert_one(booking)
    booking.pop("_id", None)
    booking["start_at"] = start_at.isoformat()
    return booking

@api.get("/admin/bookings")
async def admin_list_bookings(date_str: Optional[str] = Query(None, alias="date"), user=Depends(require_admin)):
    query = {}
    if date_str:
        d = parse_date(date_str)
        day_start_local = datetime.combine(d, time(0, 0), tzinfo=TZ)
        day_end_local = day_start_local + timedelta(days=1)
        query["start_at"] = {"$gte": day_start_local.astimezone(timezone.utc), "$lt": day_end_local.astimezone(timezone.utc)}
    items = await bookings_col.find(query, {"_id": 0}).sort("start_at", 1).to_list(500)
    for i in items:
        if isinstance(i.get("start_at"), datetime):
            dt = i["start_at"]
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            i["start_at"] = dt.astimezone(TZ).isoformat()
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
        "preferred_slot": data.preferred_slot,
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

# ---------------- SCHEDULE / TIME-OFF ----------------
@api.get("/schedule")
async def get_schedule():
    """Public endpoint: current weekly schedule + upcoming time-off (for customer UI)."""
    sched = await settings_col.find_one({"_id": "business_schedule"})
    weekly = (sched or {}).get("weekly", {})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming = await timeoff_col.find({"date_to": {"$gte": today}}, {"_id": 0}).sort("date_from", 1).to_list(100)
    return {"weekly": weekly, "time_off": upcoming}

@api.put("/admin/schedule")
async def update_schedule(data: WeeklyScheduleIn, user=Depends(require_admin)):
    # Basic validation
    for k, wins in data.weekly.items():
        if k not in [str(i) for i in range(7)]:
            raise HTTPException(status_code=400, detail=f"Invalid day key: {k}")
        for w in wins:
            if not isinstance(w, list) or len(w) != 2:
                raise HTTPException(status_code=400, detail="Each window must be [start, end]")
            _parse_hhmm(w[0])
            _parse_hhmm(w[1])
    await settings_col.update_one(
        {"_id": "business_schedule"},
        {"$set": {"weekly": data.weekly}},
        upsert=True,
    )
    return {"ok": True, "weekly": data.weekly}

@api.get("/admin/time-off")
async def list_time_off(user=Depends(require_admin)):
    items = await timeoff_col.find({}, {"_id": 0}).sort("date_from", -1).to_list(500)
    return items

@api.post("/admin/time-off")
async def create_time_off(data: TimeOffIn, user=Depends(require_admin)):
    # Validate dates
    df = parse_date(data.date_from)
    dt = parse_date(data.date_to)
    if dt < df:
        raise HTTPException(status_code=400, detail="date_to prima di date_from")
    if data.time_from:
        _parse_hhmm(data.time_from)
    if data.time_to:
        _parse_hhmm(data.time_to)
    doc = {
        "time_off_id": new_id("to"),
        "date_from": data.date_from,
        "date_to": data.date_to,
        "type": data.type,
        "time_from": data.time_from,
        "time_to": data.time_to,
        "reason": data.reason or "",
        "created_at": now_utc(),
    }
    await timeoff_col.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/admin/time-off/{time_off_id}")
async def delete_time_off(time_off_id: str, user=Depends(require_admin)):
    await timeoff_col.delete_one({"time_off_id": time_off_id})
    return {"ok": True}

# ---------------- ADMIN NOTIFICATIONS ----------------
@api.get("/admin/notifications")
async def list_notifications(user=Depends(require_admin)):
    items = await notifications_col.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for i in items:
        if isinstance(i.get("created_at"), datetime):
            i["created_at"] = to_iso(i["created_at"])
    unread = await notifications_col.count_documents({"read": False})
    return {"items": items, "unread": unread}

@api.patch("/admin/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user=Depends(require_admin)):
    await notifications_col.update_one({"notif_id": notif_id}, {"$set": {"read": True}})
    return {"ok": True}

@api.post("/admin/notifications/mark-all-read")
async def mark_all_read(user=Depends(require_admin)):
    await notifications_col.update_many({"read": False}, {"$set": {"read": True}})
    return {"ok": True}

async def notify_waitlist_for_slot(cancelled_booking: dict):
    """When a booking is cancelled, notify waitlist users for that date whose preferred slot matches."""
    sa = cancelled_booking.get("start_at")
    if not sa:
        return
    if isinstance(sa, str):
        try:
            sa = datetime.fromisoformat(sa)
        except Exception:
            return
    if sa.tzinfo is None:
        sa = sa.replace(tzinfo=timezone.utc)
    sa_local = sa.astimezone(TZ)
    date_str = sa_local.strftime("%Y-%m-%d")
    hour = sa_local.hour
    slot_period = "morning" if hour < 13 else "afternoon"
    matches = await waitlist_col.find({
        "desired_date": date_str,
        "service_id": cancelled_booking.get("service_id"),
        "notified": False,
        "$or": [
            {"preferred_slot": "any"},
            {"preferred_slot": slot_period},
            {"preferred_slot": {"$exists": False}},  # legacy entries
        ],
    }, {"_id": 0}).to_list(50)
    for w in matches:
        await waitlist_col.update_one({"waitlist_id": w["waitlist_id"]}, {"$set": {"notified": True, "notified_at": now_utc()}})
        time_hint = sa_local.strftime("%H:%M")
        await send_email_async(
            w["user_email"],
            f"Posto libero il {date_str} - Barbershop",
            f"<h2>Buone notizie {w.get('user_name','')}!</h2><p>Si è liberato un posto per <b>{w['service_name']}</b> il <b>{date_str} alle {time_hint}</b>. Apri l'app per prenotare.</p>",
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
    """Every 5 minutes: send reminders + auto-complete past bookings."""
    await asyncio.sleep(10)
    while True:
        try:
            now = now_utc()

            # Auto-complete confirmed bookings whose end time has passed
            past = await bookings_col.find({
                "status": "confirmed",
                "start_at": {"$lt": now},
            }, {"_id": 0}).to_list(500)
            for b in past:
                sa = b["start_at"]
                if isinstance(sa, str):
                    sa = datetime.fromisoformat(sa)
                if sa.tzinfo is None:
                    sa = sa.replace(tzinfo=timezone.utc)
                dur = int(b.get("duration_minutes", SLOT_MINUTES))
                if now >= sa + timedelta(minutes=dur):
                    await bookings_col.update_one(
                        {"booking_id": b["booking_id"]},
                        {"$set": {"status": "completed", "auto_completed_at": now}},
                    )

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
