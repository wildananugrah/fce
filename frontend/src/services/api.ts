const BASE_URL = import.meta.env.VITE_API_URL || "";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const newToken = json.data.accessToken;
    setAccessToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || "Request failed");
  }

  const json = await res.json();
  return json.data;
}
