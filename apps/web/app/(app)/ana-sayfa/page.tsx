import type { Metadata } from "next";
import { Dashboard } from "@/components/student/dashboard";
import { MyAssignments } from "@/components/student/my-assignments";
import { getCatalog } from "@/lib/content/catalog";

export const metadata: Metadata = { title: "Ana Sayfa" };

export default function HomePage() {
  const catalog = getCatalog();
  return (
    <>
      <MyAssignments lessons={catalog.lessons} />
      <Dashboard catalog={catalog} />
    </>
  );
}
