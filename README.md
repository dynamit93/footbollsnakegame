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

## Repo

[github.com/dynamit93/footbollsnakegame](https://github.com/dynamit93/footbollsnakegame)
