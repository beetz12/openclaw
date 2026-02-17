/** Design tokens exported as JS values for Tailwind config integration. */

export const colors = {
  primary: {
    DEFAULT: "#0d9488",
    light: "#5eead4",
    dark: "#0f766e",
    bg: "#f0fdfa",
  },
  accent: {
    DEFAULT: "#f97316",
    light: "#fed7aa",
    dark: "#c2410c",
    bg: "#fff7ed",
  },
  success: {
    DEFAULT: "#059669",
    bg: "#ecfdf5",
    dark: "#065f46",
    light: "#d1fae5",
    lighter: "#ecfdf5",
    border: "#a7f3d0",
  },
  danger: {
    DEFAULT: "#e11d48",
    bg: "#fff1f2",
    dark: "#9f1239",
    light: "#ffe4e6",
    lighter: "#fff1f2",
    border: "#fecdd3",
  },
  warning: {
    DEFAULT: "#d97706",
    bg: "#fffbeb",
    dark: "#92400e",
    light: "#fef3c7",
    lighter: "#fffbeb",
    border: "#fde68a",
  },
  info: {
    DEFAULT: "#2563eb",
    bg: "#eff6ff",
    light: "#dbeafe",
    border: "#bfdbfe",
    dark: "#1e40af",
  },
  action: {
    DEFAULT: "#0d9488",
    hover: "#0f766e",
  },
  bg: {
    DEFAULT: "#f8fafc",
    subtle: "#f1f5f9",
    muted: "#e2e8f0",
  },
  surface: "#ffffff",
  border: {
    DEFAULT: "#e2e8f0",
    light: "#f1f5f9",
    input: "#cbd5e1",
  },
  text: {
    DEFAULT: "#0f172a",
    secondary: "#64748b",
    muted: "#94a3b8",
    body: "#334155",
  },
} as const;

export const fontFamily = {
  sans: ["Plus Jakarta Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
  mono: ["DM Mono", "Fira Code", "SF Mono", "ui-monospace", "monospace"],
} as const;

export const fontSize = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
} as const;

export const borderRadius = {
  sm: "6px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  full: "9999px",
} as const;

export const boxShadow = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
  md: "0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)",
  lg: "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)",
  xl: "0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04)",
} as const;

export const transition = {
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durationFast: "150ms",
  durationNormal: "200ms",
} as const;

export const layout = {
  tabBarHeight: "72px",
} as const;
