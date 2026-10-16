import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const ui = Plus_Jakarta_Sans({ variable: "--font-ui", subsets: ["latin", "latin-ext"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "AI Atölye", template: "%s · AI Atölye" },
  description: "Yapay zekâyı deneyerek öğren: etkileşimli deneyler, tarayıcıda çalışan Python ve gerçek modeller.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

// Applies the saved theme before first paint to avoid a flash. Static string.
const themeScript = `try{var t=localStorage.getItem("aiatolye:theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${ui.variable} ${code.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
