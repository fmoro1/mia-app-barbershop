import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { storage } from "@/src/utils/storage";
import { api, getToken, setToken, clearToken } from "./api";
import { registerForPush } from "./push";

const BIO_KEY = "bshop_biometric_enabled";

export type User = {
  user_id: string;
  email: string;
  name?: string;
  phone?: string;
  role: "admin" | "customer";
  providers: string[];
  must_pay_online: boolean;
  blacklisted: boolean;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  locked: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  loginGoogle: (session_token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  unlock: () => Promise<boolean>;
};

const AuthContext = createContext<Ctx>({} as any);

async function bioAvailableAndEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!has || !enrolled) return false;
    const en = await storage.getItem<boolean>(BIO_KEY, false);
    return !!en;
  } catch { return false; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); setLocked(false); return; }
    try {
      const u = await api.me();
      setUser(u);
      if (u?.user_id) registerForPush(u.user_id);
      if (await bioAvailableAndEnabled()) setLocked(true);
    } catch {
      await clearToken();
      setUser(null);
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const unlock = async (): Promise<boolean> => {
    if (Platform.OS === "web") { setLocked(false); return true; }
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sblocca Barbershop",
        cancelLabel: "Annulla",
        fallbackLabel: "Usa passcode",
        disableDeviceFallback: false,
      });
      if (res.success) { setLocked(false); return true; }
      return false;
    } catch { return false; }
  };

  const loginEmail = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await setToken(res.access_token);
    setUser(res.user);
    setLocked(false);
    if (res.user?.user_id) registerForPush(res.user.user_id);
  };
  const register = async (email: string, password: string, name: string, phone?: string) => {
    const res = await api.register({ email, password, name, phone });
    await setToken(res.access_token);
    setUser(res.user);
    setLocked(false);
    if (res.user?.user_id) registerForPush(res.user.user_id);
  };
  const loginGoogle = async (session_token: string) => {
    const res = await api.google(session_token);
    await setToken(res.access_token);
    setUser(res.user);
    setLocked(false);
    if (res.user?.user_id) registerForPush(res.user.user_id);
  };
  const logout = async () => {
    await clearToken();
    setUser(null);
    setLocked(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, locked, loginEmail, register, loginGoogle, logout, refresh, unlock }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
