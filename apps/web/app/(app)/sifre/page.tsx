import type { Metadata } from "next";
import { PasswordForm } from "@/components/auth/password-form";
import { RequireAccount } from "@/components/auth/require-account";

export const metadata: Metadata = { title: "Şifre" };

export default function PasswordPage() {
  return (
    <RequireAccount>
      <PasswordForm />
    </RequireAccount>
  );
}
