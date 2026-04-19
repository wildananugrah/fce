import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, setAccessToken } from "../services/api";
import type { User } from "../types";

/**
 * Signup returns one of two shapes depending on whether an invitation token
 * was supplied. Pages branch on `verificationRequired` to either navigate
 * (invitation path = logged in immediately) or show "check your email".
 */
export type SignupOutcome =
  | { verificationRequired: false; user: User }
  | { verificationRequired: true; email: string };

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string, invitationToken?: string) => Promise<SignupOutcome>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  const signup = useCallback(async (
    email: string,
    password: string,
    fullName?: string,
    invitationToken?: string,
  ): Promise<SignupOutcome> => {
    const result = await api<
      | { verificationRequired: false; user: User; accessToken: string }
      | { verificationRequired: true; email: string }
    >("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName, invitationToken }),
    });
    if (result.verificationRequired) {
      return { verificationRequired: true, email: result.email };
    }
    setAccessToken(result.accessToken);
    setUser(result.user);
    return { verificationRequired: false, user: result.user };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ""}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort — clear client state regardless
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const userData = await api<User>("/api/auth/me");
    setUser((prev) => (prev ? userData : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
