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

**Root directory `client`:** Enable *Include files outside the root directory in the Build Step* so `../shared/src` is available. The client resolves `@soccer-snake/shared` via TypeScript paths and a Vite alias (no `npm` link to `shared` required). [`client/vercel.json`](client/vercel.json) pins `buildCommand` / `outputDirectory`.

**Root directory `.`:** Use root [`vercel.json`](vercel.json) (`outputDirectory`: `client/dist`).

Set **`VITE_SERVER_URL`** in Vercel to your Socket.IO server origin (e.g. `https://your-api.onrender.com`) so production does not rely on the Vite dev proxy.

## Repo

[github.com/dynamit93/footbollsnakegame](https://github.com/dynamit93/footbollsnakegame)
