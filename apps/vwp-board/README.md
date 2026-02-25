# VWP Board

## Gemini Live Voice Call Mode

Voice call mode uses Gemini Live for voice I/O only:

- STT: microphone audio is transcribed by Gemini Live.
- Brain: finalized user transcripts are sent to OpenClaw via the existing chat API path.
- TTS: OpenClaw assistant text is sent back to Gemini Live and spoken with the Zephyr voice.

Text chat behavior is unchanged.

### Environment

For local browser demo mode, set:

```bash
NEXT_PUBLIC_GEMINI_API_KEY=your_google_ai_studio_key
```

### How To Use

1. Start the app normally.
2. Click the `📞 Start call` button in chat.
3. Watch call status (`Connecting`, `Live`, `Error`) near the input.
4. Speak naturally; finalized transcript lines are posted as user messages.
5. OpenClaw replies in chat and those replies are spoken via Gemini Live.
6. Click `Stop` or `📞 End call` to end the session.

## Deploying Mission Control changes (required)

After any code change, use this exact sequence so the running launchd service picks up the latest build cleanly:

```bash
# 1) build
pnpm build

# 2) restart managed service
launchctl kickstart -k gui/$(id -u)/com.openclaw.mission-control

# 3) health check
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected health check: `200`

If UI appears stale/broken after restart:

```bash
./mc-recover.sh
```
