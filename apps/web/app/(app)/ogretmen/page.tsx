import type { Metadata } from "next";
import { RequireAccount } from "@/components/auth/require-account";
import { TeacherHome } from "@/components/teacher/teacher-home";

export const metadata: Metadata = { title: "Sınıflarım" };

export default function TeacherPage() {
  return (
    <RequireAccount roles={["teacher", "admin"]}>
      <TeacherHome />
    </RequireAccount>
  );
}
