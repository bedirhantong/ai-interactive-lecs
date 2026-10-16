import type { Metadata } from "next";
import { ProfileSettings } from "@/components/student/profile";

export const metadata: Metadata = { title: "Profil" };

export default function ProfilePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Profil</h1>
        <p className="mt-2 text-muted">Hesap gerekmez. Burada yaptığın ayarlar yalnızca bu tarayıcıda saklanır.</p>
      </header>
      <ProfileSettings />
    </div>
  );
}
