import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, setAccessToken } from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/auth/refresh`,
          { method: "POST", credentials: "include" },
        );
        if (refreshRes.ok) {
          const json = await refreshRes.json();
          setAccessToken(json.data.accessToken);
          const userData = await api<User>("/api/auth/me");
          setUser(userData);
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User; accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    const result = await api<{ user: User; accessToken: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
