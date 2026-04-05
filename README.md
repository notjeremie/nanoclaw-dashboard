# NanoClaw Dashboard

Self-hosted monitoring dashboard for NanoClaw automations.

Displays scheduled tasks, RPi scripts, contacts, groups, and system health.
Updates every 5 minutes without requiring any LLM tokens.

## Features

- Dark admin UI (sidebar navigation + sections)
- Password-protected login (session cookie, 7 days)
- Push endpoints for RPi daemon and NanoClaw agent
- Snapshot: tasks, people, groups, VPS health, PM2 status
- Client-side polling every 5 minutes

## Stack

- Node.js + Express
- express-session + bcryptjs
- Vanilla JS frontend (no framework)
- PM2 for process management

## Quick Start



## Push Sources

Two sources push JSON snapshots to the server:

- POST /push/rpi from RPi daemon every 5 min (scripts + VPS health)
- POST /push/nanoclaw from NanoClaw agent every 30 min (tasks + people + groups)

Both require X-Push-Token header matching PUSH_TOKEN in .env.

## License

MIT
