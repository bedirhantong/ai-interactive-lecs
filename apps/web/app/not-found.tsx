import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-2xl font-extrabold">Bu sayfa bulunamadı</h1>
      <p className="max-w-md text-muted">Aradığın ders ya da sayfa yok ya da taşınmış olabilir.</p>
      <ButtonLink href="/ana-sayfa">Ana sayfaya dön</ButtonLink>
    </div>
  );
}
