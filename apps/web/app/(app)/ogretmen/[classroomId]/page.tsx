import type { Metadata } from "next";
import { Suspense } from "react";
import { ClassroomPage } from "@/components/teacher/classroom-view";
import { getTeacherCatalog } from "@/lib/content/catalog";

export const metadata: Metadata = { title: "Sınıf" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface-2" />}>
      <ClassroomPage catalog={getTeacherCatalog()} />
    </Suspense>
  );
}
