# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Game Liberty is a browser game library (npm workspaces monorepo) with three packages: `shared`, `client`, `server`. No database or external services are required — all game state is in-memory.

### Standard commands

See `README.md` and root `package.json` for canonical commands. Key ones:

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev (all services) | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Build (prod) | `npm run build` |

### Dev server startup

`npm run dev` builds `shared` first, then starts the API server (`tsx watch`, port 3001) and the Vite client (port 5173) concurrently. The client waits for the server to be available on port 3001 before starting. The Vite dev server proxies `/socket.io` WebSocket traffic to `localhost:3001`.

### Gotchas

- The `shared` package **must** be built before the server can start (it consumes `shared/dist`). The client resolves shared source directly via a Vite alias, so it does not need the built output.
- There are no automated tests or lint scripts in the repo currently — `typecheck` is the primary code-quality gate.
- Node.js ≥ 20 is required (`engines` field in root `package.json`).
- No `.env` file is needed for local development; the Vite proxy handles API routing automatically.
