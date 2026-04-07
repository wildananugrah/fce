export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isSuperadmin: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface ApiError {
  error: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  avatarColor: string;
  avatarEmoji: string | null;
  role: string;
}
