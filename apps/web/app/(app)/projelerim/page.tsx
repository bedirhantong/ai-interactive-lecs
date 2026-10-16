import type { Metadata } from "next";
import { Portfolio } from "@/components/student/portfolio";
import { getCatalog } from "@/lib/content/catalog";
import { loadContent } from "@/lib/content/loader";

export const metadata: Metadata = { title: "Projelerim" };

export default function PortfolioPage() {
  const catalog = getCatalog();
  const { lessons } = loadContent();
  const projectLessons = Object.fromEntries(
    Object.values(catalog.projects).flatMap((p) => Object.values(p.modes).map((id) => [id, lessons.get(id)!])),
  );
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Projelerim</h1>
        <p className="mt-2 max-w-2xl text-muted">Tamamladığın projeler, sonuçları ve düşüncelerinle birlikte burada. Defterini Jupyter formatında (.ipynb) indirebilirsin.</p>
      </header>
      <Portfolio catalog={catalog} lessons={projectLessons} />
    </div>
  );
}
