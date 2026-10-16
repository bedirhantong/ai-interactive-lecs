export type Role = "student" | "teacher" | "admin";

export interface SessionUser {
  id: string;
  role: Role;
  display_name: string;
  username: string | null;
  email: string | null;
  age_band: string | null;
  is_demo: boolean;
  must_change_password: boolean;
}

export interface SessionOut {
  user: SessionUser;
  expires_at: string;
}
