# Zero-Config Mission Control + Global NexClaw Rollout

## Goal

New users should get Mission Control + Autonomous Activity Feed out-of-the-box, and `nexclaw` should work globally from any directory.

## What is now implemented

- Activity feed backend routes in VWP dispatch.
- Activity page in Mission Control with filters + digest cards.
- High-impact Telegram mirror support via env vars.
- Migration utility: `pnpm vwp:migrate` (schema-safe task backfill for activity files).
- Global CLI installer helper: `pnpm nexclaw:global`.

## Install/Bootstrap path for new users

1. Install deps + build.
2. Start stack with one command: `pnpm vwp:start`.
3. Ensure global CLI availability: `pnpm nexclaw:global`.
4. Optional migration for existing data: `pnpm vwp:migrate`.

## Existing-user migration path (Phase 6)

- Backfill missing task artifacts (`activity.json`) for older tasks.
- Keep config migration schema-safe (no unknown key injection).
- Rebuild/restart stack.

## Global CLI defaults

- `nexclaw` and `openclaw` are linked via package bin.
- If pnpm global bin is missing, installer prints PATH guidance.

## Follow-up implementation tasks

1. Add onboarding hint after first `vwp:start`: open `/activity`.
2. Add settings UI toggle for Telegram high-impact mirror (persist in supported config surface).
3. Add CI smoke test:
   - `/vwp/dispatch/activity` route returns 200.
   - `/activity` page renders.
4. Add docs section “Use nexclaw globally” with PATH troubleshooting.
