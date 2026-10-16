import type { SessionUser } from "./types";

/** Where a user lands after signing in. */
export function homeFor(user: SessionUser): string {
  if (user.must_change_password) return "/sifre";
  return user.role === "student" ? "/ana-sayfa" : "/ogretmen";
}
