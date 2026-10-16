import type { Metadata } from "next";
import { Achievements } from "@/components/student/achievements";
import { getCatalog } from "@/lib/content/catalog";

export const metadata: Metadata = { title: "Başarılarım" };

export default function AchievementsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Başarılarım</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Beceriler tıklayarak değil, yaparak kazanılır: kod çalıştırmak, model eğitmek, test geçmek, düşüncelerini yazmak. Her becerinin altında, onu
          gösteren işlerin listesi var.
        </p>
        <p className="mt-2 text-xs text-subtle">Demo modunda bu kayıtlar senin tarayıcında hesaplanır (öz bildirim); not vermek için kanıt sayılmaz.</p>
      </header>
      <Achievements catalog={getCatalog()} />
    </div>
  );
}
