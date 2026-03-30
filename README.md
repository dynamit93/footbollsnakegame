# Game Liberty

A **browser game library** (Steam-style hub for web games) built with React and Vite. Open the app, pick a title, and play — no install.

Included games:

| Game | Route | Notes |
|------|--------|------|
| **Soccer Snake** | `/games/soccer-snake` | Online 1v1 grid soccer + Snake (Socket.IO + dedicated API) |
| **Neon Hollow** | `/games/neon-hollow` | Single-player Three.js FPS: pointer lock, WASD, shoot targets |

The home page at `/` lists all games. Deep links work on Vercel thanks to SPA `rewrites` in [`client/vercel.json`](client/vercel.json) and the root [`vercel.json`](vercel.json).

**Production UI:** [https://footbollsnakegame-client.vercel.app/](https://footbollsnakegame-client.vercel.app/) (canonical URL is set in `client/index.html` and [`client/src/site.ts`](client/src/site.ts)).

**Production API (Render):** [https://footbollsnakegame-api.onrender.com/health](https://footbollsnakegame-api.onrender.com/health) should return `{"ok":true}`. On Render, set **`CLIENT_ORIGIN`** to `https://footbollsnakegame-client.vercel.app` so the browser can open Socket.IO from the Vercel UI.

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the Vite URL (usually [http://localhost:5173](http://localhost:5173)). Run `npm run build` for production builds.

## Deploy the API on Render (recommended)

This repo includes [`render.yaml`](render.yaml) for a **Node Web Service** that runs the game server.

1. In [Render](https://render.com), **New → Blueprint**, connect [footbollsnakegame](https://github.com/dynamit93/footbollsnakegame) (or **New → Web Service** with root repo and the same build/start commands as in `render.yaml`).
2. When prompted for **`CLIENT_ORIGIN`**, set your **Vercel frontend** origin exactly (no path), e.g. `https://footbollsnakegame-client.vercel.app`.
3. After the service is live, copy its URL (e.g. `https://footbollsnakegame-api.onrender.com`).
4. In Vercel → **Environment Variables**: set **`VITE_SERVER_URL`** to that API URL (not your `*.vercel.app` UI), **or** leave/remove a wrong value — the client also reads [`client/public/socket-config.json`](client/public/socket-config.json) and falls back to the default Render hostname from [`render.yaml`](render.yaml). Save and **Redeploy** the frontend.

## Deploy on Vercel (static UI)

The app is a static Vite build. The real-time server must be hosted separately (Railway, Render, Fly, etc.).

**Root directory `client`:** Enable *Include files outside the root directory in the Build Step* so `../shared/src` is available. The client resolves `@soccer-snake/shared` via TypeScript paths and a Vite alias (no `npm` link to `shared` required). [`client/vercel.json`](client/vercel.json) pins `buildCommand` / `outputDirectory`.

**Root directory `.`:** Use root [`vercel.json`](vercel.json) (`outputDirectory`: `client/dist`).

### Backend URL (required for the live site)

Vercel only hosts the **static** UI. The game **API** is the `server` package (Express + Socket.IO).

1. Deploy `server` somewhere that runs Node (Render, Railway, Fly, etc.). Default listen port is **3001**; set **`PORT`** if the host assigns one.
2. On that host, set **`CLIENT_ORIGIN`** to your Vercel site origin (e.g. `https://your-app.vercel.app`) so Socket.IO CORS accepts the browser. Use a comma-separated list if you have preview URLs too.
3. In **Vercel** → your project → **Settings → Environment Variables**, add **`VITE_SERVER_URL`** = the **public HTTPS origin** of your API (no path, no trailing slash), e.g. `https://football-snake-api.onrender.com`.
4. **Redeploy** the Vercel project so the client is rebuilt with that variable (Vite bakes it in at build time).

If the UI says the variable is **missing from the deployment**, you added it in Vercel but did not **Redeploy** (or saved without deploy). Vite reads env vars **only when the frontend build runs**.

**Common mistake:** `VITE_SERVER_URL=https://your-app.vercel.app` (the **frontend**) is wrong. The game API is the **`server`** package on another host, e.g. `https://football-api.onrender.com`. The frontend and API must be **two different URLs**.

If it shows “Cannot reach game server” with a **correct** API URL, the API is down, blocked, or **`CLIENT_ORIGIN`** on the server does not include your Vercel frontend origin.

Use a **HTTPS** API URL when the site is served over HTTPS (mixed content otherwise).

**Deploy commit:** use the latest `main` (not `c2e4a64`) so the client build finds `../shared` (path alias). See [`client/.env.example`](client/.env.example).

## Check production (`curl`-style)

After deploys propagate (~1–2 min), from repo root:

```bash
npm run verify:deploy
```

Expect **API /health** to pass only after the Render (or other) service exists and is awake.

## Repo

[github.com/dynamit93/footbollsnakegame](https://github.com/dynamit93/footbollsnakegame)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dynamit93/footbollsnakegame)

Docker (API only): `docker build -t footboll-api .` then run with `PORT` and `CLIENT_ORIGIN` (see [`Dockerfile`](Dockerfile)).
