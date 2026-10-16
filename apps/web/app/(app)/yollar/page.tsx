import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getCatalog } from "@/lib/content/catalog";
import { LEVEL_LABELS } from "@/lib/content/schema";

export const metadata: Metadata = { title: "Öğrenme Yolları" };

export default function PathsPage() {
  const { paths } = getCatalog();
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Öğrenme Yolları</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Her yol modüllerden, her modül deneylerle dolu derslerden ve projelerden oluşur. Seviyeler yaşa değil becerine göredir: istediğin yoldan başlayabilirsin.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {paths.map((path) => {
          const items = path.modules.flatMap((m) => m.items);
          const ready = items.filter((i) => i.kind !== "planned").length;
          return (
            <Link
              key={path.id}
              href={`/yollar/${path.id}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card hover:border-border-strong"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">Yol {path.order}</div>
              <h2 className="mt-1 text-xl font-bold group-hover:text-brand">{path.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted">{path.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {path.levels.map((l) => (
                  <Badge key={l} tone="brand">
                    {LEVEL_LABELS[l]}
                  </Badge>
                ))}
                <Badge>{ready > 0 ? `${ready} hazır içerik` : "Hazırlanıyor"}</Badge>
                <ArrowRight aria-hidden className="ml-auto size-5 text-brand" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
