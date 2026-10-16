import type { Metadata } from "next";
import { Dashboard } from "@/components/student/dashboard";
import { getCatalog } from "@/lib/content/catalog";

export const metadata: Metadata = { title: "Ana Sayfa" };

export default function HomePage() {
  return <Dashboard catalog={getCatalog()} />;
}
