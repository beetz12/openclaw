import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import { AgentToggleButton } from "@/components/layout/AgentToggleButton";
import { MobileAgentTab } from "@/components/layout/MobileAgentTab";
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
        <h1 className="text-xl font-bold text-[var(--color-primary)]">VWP Board</h1>
      </div>
      <nav className="flex flex-col gap-1">
        <a
          href="/board"
          className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          Board
        </a>
        <a
          href="/goals/new"
          className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          New Goal
        </a>
        <a
          href="/tools"
          className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
        >
          Tools
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
        href="/goals/new"
        className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <line x1="10" y1="6" x2="10" y2="14" />
          <line x1="6" y1="10" x2="14" y2="10" />
        </svg>
        New Goal
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
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col md:flex-row">
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[var(--tab-bar-height)] md:pb-0">
              {children}
            </main>
          </div>
        </div>
        <TabBar />
      </body>
    </html>
  );
}
