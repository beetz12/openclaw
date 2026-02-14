import { css } from "lit";

export const sharedStyles = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-lg);
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      transform 0.1s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn-primary {
    background: var(--color-primary);
    color: #ffffff;
  }

  .btn-primary:hover {
    background: var(--color-primary-dark);
  }

  .btn-success {
    background: var(--color-success);
    color: #ffffff;
  }

  .btn-danger {
    background: var(--color-danger);
    color: #ffffff;
  }

  .btn-outline {
    background: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .btn-outline:hover {
    background: var(--color-bg);
  }

  .input {
    width: 100%;
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    background: var(--color-surface);
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-bg);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 1;
  }

  .badge-primary {
    background: var(--color-primary);
    color: #ffffff;
  }

  .badge-danger {
    background: var(--color-danger);
    color: #ffffff;
  }

  .text-muted {
    color: var(--color-text-muted);
  }

  .text-secondary {
    color: var(--color-text-secondary);
  }
`;
