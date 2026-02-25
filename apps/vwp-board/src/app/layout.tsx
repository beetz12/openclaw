import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import { AgentToggleButton } from "@/components/layout/AgentToggleButton";
import { DesktopBadge } from "@/components/layout/DesktopBadge";
import { MobileAgentTab } from "@/components/layout/MobileAgentTab";
import { SseProvider } from "@/components/layout/SseProvider";
import { OnboardingGuard } from "@/components/OnboardingGuard";
import { CommandPalette } from "@/components/search/CommandPalette";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VWP Board",
  description: "Kanban board for VWP task management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-primary)]">VWP Board<DesktopBadge /></h1>
      </div>
      <nav className="flex flex-col gap-1">
        <a
          href="/"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4h12a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
          Chat
        </a>
        <a
          href="/board"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="5" height="14" rx="1" />
            <rect x="8" y="5" width="5" height="10" rx="1" />
            <rect x="14" y="4" width="5" height="12" rx="1" />
          </svg>
          Board
        </a>
        <a
          href="/tools"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14.5 3.5l2 2-8.5 8.5H6v-2L14.5 3.5z" />
            <path d="M12.5 5.5l2 2" />
            <path d="M3 17h14" />
          </svg>
          Tools
        </a>
        <a
          href="/cowork"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h14a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z" />
            <path d="M7 15v2M13 15v2M5 17h10" />
            <path d="M6 9l2 2 4-4" />
          </svg>
          CoWork
        </a>
        <a
          href="/cost"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 5v10M7.5 7.5h4a1.5 1.5 0 010 3H8a1.5 1.5 0 000 3h4.5" />
          </svg>
          Cost
        </a>
        <a
          href="/activity"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 10h3l2-4 4 8 2-4h3" />
          </svg>
          Activity
        </a>
        <a
          href="/docs"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 3h7l3 3v11H5z" />
            <path d="M12 3v3h3" />
          </svg>
          Docs
        </a>
        <a
          href="/approvals"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4h14v12H3z" />
            <path d="M6 8h8M6 12h5" />
          </svg>
          Approvals
        </a>
        <a
          href="/calendar"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="14" height="13" rx="2" />
            <path d="M6 2v4M14 2v4M3 8h14" />
          </svg>
          Calendar
        </a>
        <a
          href="/cron"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 6v4l3 3" />
          </svg>
          Cron Jobs
        </a>
        <a
          href="/workforce"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="7" r="2" />
            <circle cx="14" cy="7" r="2" />
            <path d="M2.5 15c.8-2 2.4-3 4.5-3s3.7 1 4.5 3" />
            <path d="M8.5 15c.8-2 2.4-3 4.5-3s3.7 1 4.5 3" />
          </svg>
          Workforce
        </a>
        <a
          href="/settings"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="3" />
            <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.5 3.5l1.5 1.5M15 15l1.5 1.5M16.5 3.5l-1.5 1.5M5 15l-1.5 1.5" />
          </svg>
          Settings
        </a>
        <AgentToggleButton />
      </nav>
    </aside>
  );
}

function TabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-[var(--tab-bar-height)] items-center justify-around border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <a
        href="/"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4h12a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z" />
        </svg>
        Chat
      </a>
      <a
        href="/board"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="5" height="14" rx="1" />
          <rect x="8" y="5" width="5" height="10" rx="1" />
          <rect x="14" y="4" width="5" height="12" rx="1" />
        </svg>
        Board
      </a>
      <a
        href="/tools"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.5 3.5l2 2-8.5 8.5H6v-2L14.5 3.5z" />
          <path d="M12.5 5.5l2 2" />
          <path d="M3 17h14" />
        </svg>
        Tools
      </a>
      <a
        href="/cowork"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5h14a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z" />
          <path d="M7 15v2M13 15v2M5 17h10" />
          <path d="M6 9l2 2 4-4" />
        </svg>
        CoWork
      </a>
      <a
        href="/activity"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 10h3l2-4 4 8 2-4h3" />
        </svg>
        Activity
      </a>
      <a
        href="/docs"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 3h7l3 3v11H5z" />
          <path d="M12 3v3h3" />
        </svg>
        Docs
      </a>
      <a
        href="/approvals"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4h14v12H3z" />
          <path d="M6 8h8M6 12h5" />
        </svg>
        Approvals
      </a>
      <a
        href="/calendar"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M6 2v4M14 2v4M3 8h14" />
        </svg>
        Calendar
      </a>
      <a
        href="/cron"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v4l3 3" />
        </svg>
        Cron
      </a>
      <a
        href="/workforce"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="7" r="2" />
          <circle cx="14" cy="7" r="2" />
          <path d="M2.5 15c.8-2 2.4-3 4.5-3s3.7 1 4.5 3" />
          <path d="M8.5 15c.8-2 2.4-3 4.5-3s3.7 1 4.5 3" />
        </svg>
        Workforce
      </a>
      <MobileAgentTab />
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${dmMono.variable}`}>
      <body className="min-h-screen bg-[var(--color-bg)]">
        <SseProvider />
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col md:flex-row">
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[var(--tab-bar-height)] md:pb-0">
              <OnboardingGuard>{children}</OnboardingGuard>
            </main>
          </div>
        </div>
        <TabBar />
      </body>
    </html>
  );
}
