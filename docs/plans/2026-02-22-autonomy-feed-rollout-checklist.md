# Autonomy Feed Rollout Checklist (Mission Control)

## Completed

- [x] Activity aggregation endpoint: `GET /vwp/dispatch/activity`
- [x] Activity write endpoint: `POST /vwp/dispatch/tasks/:id/activity`
- [x] Mission Control Activity page with filters + digest cards
- [x] Morning/Midday/Evening digest summaries in Activity UI
- [x] High-impact Telegram mirror (env-driven, best-effort)

## To Enable Telegram High-Impact Alerts

Set in gateway runtime environment:

- `OPENCLAW_VWP_TELEGRAM_BOT_TOKEN`
- `OPENCLAW_VWP_TELEGRAM_CHAT_ID`

Then restart VWP stack:

```bash
cd /Users/dave/Work/openclaw
pnpm vwp:stop
pnpm vwp:start
```

## Verification Steps

1. Open `http://localhost:3000/activity`
2. Submit a validation task via dispatch API
3. Post activity entry with detail containing one of: blocked/failed/error/critical
4. Confirm:
   - Activity appears in Mission Control feed
   - Telegram receives high-impact alert

## Next Improvements (Phase 4)

- Add in-app toggle for Telegram mirror in `/settings`
- Add per-project digest chips
- Add evidence link rendering in activity cards
- Add weekly scorecard auto-card generation
