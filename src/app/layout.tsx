import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/auth-context";
import { AppHeader } from "@/components/layout/AppHeader";

export const metadata: Metadata = {
  title: "CIVISCOPE — Damage Mapper | AI Disaster Assessment & Response",
  description:
    "AI-assisted disaster damage assessment, deterministic priority calculation, duplicate incident correlation, and multi-agency response tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f4f6f8] text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <AppHeader />
            <main className="app-main flex-1 min-w-0 w-full p-4 sm:p-6">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
