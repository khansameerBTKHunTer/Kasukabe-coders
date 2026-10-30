import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';
import { AppHeader } from '@/components/layout/AppHeader';

export const metadata: Metadata = {
  title: 'CIVISCOPE — Damage Mapper | AI Disaster Assessment & Response',
  description:
    'AI-assisted disaster damage assessment, deterministic priority calculation, duplicate incident correlation, and multi-agency response tracking.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0d14] text-slate-100 antialiased selection:bg-sky-500 selection:text-slate-950">
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <AppHeader />
            <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6 max-w-[1600px] w-full mx-auto">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
