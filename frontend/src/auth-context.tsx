import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken } from "./api";

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
  loginEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  loginGoogle: (session_token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); return; }
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const loginEmail = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await setToken(res.access_token);
    setUser(res.user);
  };
  const register = async (email: string, password: string, name: string, phone?: string) => {
    const res = await api.register({ email, password, name, phone });
    await setToken(res.access_token);
    setUser(res.user);
  };
  const loginGoogle = async (session_token: string) => {
    const res = await api.google(session_token);
    await setToken(res.access_token);
    setUser(res.user);
  };
  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginEmail, register, loginGoogle, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
