import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;
const TOKEN_KEY = "bshop_token";

export const getToken = async () => (await storage.secureGet<string>(TOKEN_KEY, "")) || "";
export const setToken = (t: string) => storage.secureSet(TOKEN_KEY, t);
export const clearToken = () => storage.secureRemove(TOKEN_KEY);

async function req(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  register: (body: any) => req("/auth/register", { method: "POST", body: JSON.stringify(body) }, false),
  login: (body: any) => req("/auth/login", { method: "POST", body: JSON.stringify(body) }, false),
  google: (session_token: string) => req("/auth/google", { method: "POST", body: JSON.stringify({ session_token }) }, false),
  me: () => req("/auth/me"),
  services: () => req("/services", {}, false),
  availability: (date: string, service_id?: string) =>
    req(`/availability?date=${date}${service_id ? `&service_id=${service_id}` : ""}`, {}, false),
  createBooking: (body: any) => req("/bookings", { method: "POST", body: JSON.stringify(body) }),
  myBookings: () => req("/bookings/mine"),
  cancelBooking: (id: string) => req(`/bookings/${id}/cancel`, { method: "PATCH" }),
  joinWaitlist: (body: any) => req("/waitlist", { method: "POST", body: JSON.stringify(body) }),
  myWaitlist: () => req("/waitlist/mine"),
  leaveWaitlist: (id: string) => req(`/waitlist/${id}`, { method: "DELETE" }),
  adminBookings: (date?: string) => req(`/admin/bookings${date ? `?date=${date}` : ""}`),
  adminUpdateBooking: (id: string, body: any) => req(`/admin/bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminClients: (q?: string) => req(`/admin/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  adminUpdateClient: (id: string, body: any) => req(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminCreateService: (body: any) => req("/admin/services", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateService: (id: string, body: any) => req(`/admin/services/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDeleteService: (id: string) => req(`/admin/services/${id}`, { method: "DELETE" }),
  adminWaitlist: () => req("/admin/waitlist"),
  createPaymentIntent: (booking_id: string) => req("/payments/create-intent", { method: "POST", body: JSON.stringify({ booking_id }) }),
  changePassword: (current_password: string, new_password: string) =>
    req("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
};
