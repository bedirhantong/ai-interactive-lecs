"use client";

import { Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { useProgressHydrated } from "@/lib/progress/hydration";
import { type AgeBand, useProgress } from "@/lib/progress/store";
import { clearAll } from "@/lib/storage";
import { LevelPicker } from "./dashboard";
import { downloadJson } from "./download";

const AGE_BANDS: AgeBand[] = ["11-13", "14-15", "16-18"];

function exportAllData() {
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("aiatolye:")) data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
    }
  } catch {
    /* storage unavailable */
  }
  downloadJson("ai-atolye-verilerim.json", { exportedAt: new Date().toISOString(), data });
}

export function ProfileSettings() {
  const hydrated = useProgressHydrated();
  const profile = useProgress((s) => s.profile);
  const setProfile = useProgress((s) => s.setProfile);
  const resetAll = useProgress((s) => s.resetAll);
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const nameId = useId();
  if (!hydrated) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />;

  const section = "rounded-2xl border border-border bg-surface p-6 shadow-card";
  return (
    <div className="space-y-6">
      <section className={section}>
        <label htmlFor={nameId} className="font-bold">
          Sana nasıl hitap edelim? <span className="font-normal text-muted">(isteğe bağlı)</span>
        </label>
        <p className="text-sm text-muted">Gerçek adını yazmak zorunda değilsin. Bir takma ad da olur.</p>
        <input
          id={nameId}
          value={profile.displayName}
          maxLength={30}
          onChange={(e) => setProfile({ displayName: e.target.value })}
          className="mt-2 h-10 w-full max-w-sm rounded-lg border border-border-strong bg-surface px-3"
          autoComplete="off"
        />
      </section>

      <section className={section}>
        <h2 className="font-bold">Deneyim seviyesi</h2>
        <p className="mb-3 text-sm text-muted">Seviye yaşa değil becerine göredir. Önerilen dersleri belirler; hiçbir içeriği kilitlemez.</p>
        <LevelPicker value={profile.level} onPick={(level) => setProfile({ level })} compact />
      </section>

      <section className={section}>
        <h2 className="font-bold">
          Yaş aralığı <span className="font-normal text-muted">(isteğe bağlı)</span>
        </h2>
        <p className="mb-3 text-sm text-muted">Doğum tarihini sormuyoruz. Yalnızca içerik önerileri için kullanılabilir.</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Yaş aralığı">
          {[...AGE_BANDS, null].map((band) => (
            <button
              key={band ?? "none"}
              type="button"
              role="radio"
              aria-checked={profile.ageBand === band}
              onClick={() => setProfile({ ageBand: band })}
              className={`h-9 rounded-lg border px-3 text-sm font-semibold ${profile.ageBand === band ? "border-brand bg-brand-soft text-brand-strong" : "border-border"}`}
            >
              {band ?? "Belirtmek istemiyorum"}
            </button>
          ))}
        </div>
      </section>

      <section className={section}>
        <h2 className="font-bold">Görünüm ve editör</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.editor === "basic"}
              onChange={(e) => setProfile({ editor: e.target.checked ? "basic" : "monaco" })}
            />
            Basit kod editörü kullan (ekran okuyucular ve yavaş cihazlar için)
          </label>
          <span className="flex items-center gap-2 text-sm">
            Tema: <ThemeToggle />
          </span>
        </div>
      </section>

      <section className={section}>
        <h2 className="font-bold">Verilerim</h2>
        <p className="text-sm text-muted">
          Demo modunda tüm ilerlemen yalnızca bu tarayıcıda saklanır ve hiçbir sunucuya gönderilmez.{" "}
          <Link href="/gizlilik" className="text-brand underline">
            Gizlilik bilgisi
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportAllData}>
            <Download aria-hidden className="size-3.5" /> Verilerimi indir (JSON)
          </Button>
          {!confirm ? (
            <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden className="size-3.5" /> Tüm verilerimi sil
            </Button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              Tüm defterlerin, projelerin ve ilerlemen silinecek. Geri alınamaz.
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  clearAll();
                  resetAll();
                  setConfirm(false);
                  setDeleted(true);
                }}
              >
                Evet, sil
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Vazgeç
              </Button>
            </span>
          )}
        </div>
        {deleted && <p className="mt-2 text-sm text-success" role="status">Verilerin bu tarayıcıdan silindi.</p>}
      </section>
    </div>
  );
}
