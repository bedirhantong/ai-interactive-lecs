import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentPage } from "@/components/teacher/student-view";
import { getTeacherCatalog } from "@/lib/content/catalog";

export const metadata: Metadata = { title: "Öğrenci" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface-2" />}>
      <StudentPage catalog={getTeacherCatalog()} />
    </Suspense>
  );
}
