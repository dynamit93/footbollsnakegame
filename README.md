# Football Snake Game

Soccer-themed grid game with Snake-style movement and online 1v1 multiplayer (React + Socket.IO).

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the Vite URL (usually [http://localhost:5173](http://localhost:5173)). Run `npm run build` for production builds.

## Deploy on Vercel (static UI)

The app is a static Vite build. The real-time server must be hosted separately (Railway, Render, Fly, etc.).

**Option A — Root directory `client` (common):** Vercel runs `npm install` and `npm run build` inside `client`. The client build compiles `../shared` first, so the full repo must be connected (Vercel clones the whole project; only commands run in the subfolder). Set **Output Directory** to `dist`.

**Option B — Root directory `.`:** The repo includes [`vercel.json`](vercel.json), which runs `npm run build -w shared && npm run build -w client` and sets **Output Directory** to `client/dist`.

Set **`VITE_SERVER_URL`** in Vercel to your WebSocket server URL (e.g. `https://your-api.onrender.com`) so production builds do not rely on the dev proxy.

## Repo

[github.com/dynamit93/footbollsnakegame](https://github.com/dynamit93/footbollsnakegame)
