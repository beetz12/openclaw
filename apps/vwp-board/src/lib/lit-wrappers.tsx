"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Hook to bridge custom element events to React handlers.
 *
 * React 19 handles custom element properties natively, but custom events
 * still need manual addEventListener bridging.
 */
export function useCustomEvent<T = unknown>(
  ref: RefObject<HTMLElement | null>,
  eventName: string,
  handler: ((detail: T) => void) | undefined,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const el = ref.current;
    if (!el || !handlerRef.current) {return;}

    const listener = (e: Event) => {
      const detail = (e as CustomEvent<T>).detail;
      handlerRef.current?.(detail);
    };

    el.addEventListener(eventName, listener);
    return () => el.removeEventListener(eventName, listener);
  }, [ref, eventName]);
}

// -- TypeScript JSX declarations for Lit custom elements --
// React 19 passes properties to custom elements natively.

type CE<T = object> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement> & T,
  HTMLElement
>;

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "vwp-stat-card": CE<{
        label?: string;
        value?: string;
        "sub-text"?: string;
        trend?: string;
        "trend-direction"?: string;
        highlight?: boolean;
      }>;
      "vwp-page-header": CE<{
        "page-title"?: string;
        subtitle?: string;
        "show-back"?: boolean;
      }>;
      "vwp-message-card": CE<{ message?: unknown }>;
      "vwp-approval-dialog": CE<{
        open?: boolean;
        messageId?: string;
      }>;
      "vwp-channel-badge": CE<{ channel?: unknown }>;
      "vwp-info-card": CE<{
        icon?: string;
        label?: string;
        subtitle?: string;
        expanded?: boolean;
      }>;
      "vwp-error-toast": CE;
    }
  }
}

// -- Wrapper components with event bridging --

export interface StatCardProps {
  label: string;
  value: string;
  subText?: string;
  trend?: string;
  trendDirection?: string;
  highlight?: boolean;
}

export function VwpStatCard({
  label,
  value,
  subText,
  trend,
  trendDirection,
  highlight,
}: StatCardProps) {
  return (
    <vwp-stat-card
      label={label}
      value={value}
      sub-text={subText}
      trend={trend}
      trend-direction={trendDirection}
      highlight={highlight}
    />
  );
}

export interface PageHeaderProps {
  pageTitle: string;
  subtitle?: string;
  showBack?: boolean;
  children?: React.ReactNode;
}

export function VwpPageHeader({
  pageTitle,
  subtitle,
  showBack,
  children,
}: PageHeaderProps) {
  return (
    <vwp-page-header
      page-title={pageTitle}
      subtitle={subtitle}
      show-back={showBack}
    >
      {children && <div slot="actions">{children}</div>}
    </vwp-page-header>
  );
}

export interface InfoCardProps {
  icon?: string;
  label: string;
  subtitle?: string;
  expanded?: boolean;
  children?: React.ReactNode;
}

export function VwpInfoCard({
  icon,
  label,
  subtitle,
  expanded,
  children,
}: InfoCardProps) {
  return (
    <vwp-info-card
      icon={icon}
      label={label}
      subtitle={subtitle}
      expanded={expanded}
    >
      {children}
    </vwp-info-card>
  );
}

export interface ErrorToastHandle {
  show: (message: string) => void;
}

export function useErrorToast(
  ref: RefObject<HTMLElement | null>,
): ErrorToastHandle {
  return {
    show(message: string) {
      const el = ref.current as HTMLElement & { show?: (msg: string) => void };
      el?.show?.(message);
    },
  };
}
