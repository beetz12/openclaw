import { css } from "lit";

export const theme = css`
  :host {
    /* Warm, approachable palette */
    --color-primary: #e07842;
    --color-primary-light: #f5a66e;
    --color-primary-dark: #c45e2a;
    --color-primary-bg: #fef3ec;

    --color-success: #2d9d5c;
    --color-success-bg: #edf8f0;
    --color-danger: #d14343;
    --color-danger-bg: #fdeaea;
    --color-warning: #d4890a;
    --color-warning-bg: #fdf4e4;

    /* Neutrals */
    --color-bg: #faf8f5;
    --color-surface: #ffffff;
    --color-border: #e8e3dd;
    --color-text: #1a1a1a;
    --color-text-secondary: #6b6560;
    --color-text-muted: #9e9690;

    /* Typography */
    --font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;
    --font-size-base: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.25rem;
    --font-size-2xl: 1.5rem;
    --font-size-3xl: 1.875rem;

    /* Spacing */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-6: 24px;
    --space-8: 32px;

    /* Radii */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-full: 9999px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.1);

    /* Tab bar */
    --tab-bar-height: 64px;
  }
`;
