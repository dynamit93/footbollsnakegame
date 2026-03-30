import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import type { PublicGameState } from '@soccer-snake/shared'
import { WIN_SCORE } from '@soccer-snake/shared'
import { GameBoard } from './GameBoard.tsx'

/** Default host for Render service `footbollsnakegame-api` (see repo root `render.yaml`). */
const DEFAULT_RENDER_API = 'https://footbollsnakegame-api.onrender.com'

/** One-click deploy for this GitHub repo (set `CLIENT_ORIGIN` in dashboard after). */
const DEPLOY_RENDER_HREF =
  'https://render.com/deploy?repo=https://github.com/dynamit93/footbollsnakegame'

function normalizeOriginInput(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

/** Valid URL whose origin is not the current page (real API host). */
function usableApiUrl(candidate: string, pageOrigin: string): string | null {
  const s = normalizeOriginInput(candidate)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.origin === pageOrigin) return null
    return s
  } catch {
    return null
  }
}

type SocketFileConfig = { apiOrigin?: string; apiOrigins?: string[] }

function collectCandidates(
  page: string,
  envRaw: string,
  file: SocketFileConfig | null,
): string[] {
  const rawList: string[] = []
  if (envRaw) rawList.push(envRaw)
  if (file?.apiOrigins) rawList.push(...file.apiOrigins)
  if (file?.apiOrigin) rawList.push(file.apiOrigin)
  rawList.push(DEFAULT_RENDER_API)

  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rawList) {
    const u = usableApiUrl(r, page)
    if (u && !seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

async function healthOk(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const id = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${base}/health`, { mode: 'cors', signal: ctrl.signal })
    clearTimeout(id)
    return r.ok
  } catch {
    return false
  }
}

type ResolveResult =
  | { ok: true; url: string; label: string }
  | { ok: false; message: string }

async function resolveProductionSocket(): Promise<ResolveResult> {
  const page = window.location.origin
  const envRaw = import.meta.env.VITE_SERVER_URL?.trim() ?? ''

  let file: SocketFileConfig | null = null
  try {
    const res = await fetch('/socket-config.json', { cache: 'no-store' })
    if (res.ok) file = (await res.json()) as SocketFileConfig
  } catch {
    /* ignore */
  }

  const candidates = collectCandidates(page, envRaw, file)
  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        'No API URL available. Deploy the /server app and set public/socket-config.json or VITE_SERVER_URL.',
    }
  }

  for (const url of candidates) {
    if (await healthOk(url)) {
      const fromEnv = usableApiUrl(envRaw, page) === url
      const hint = fromEnv ? 'env' : 'discovered via /health'
      return { ok: true, url, label: `${url} (${hint})` }
    }
  }

  const fallback = candidates[0]!
  return {
    ok: true,
    url: fallback,
    label: `${fallback} (/health not OK — service may be sleeping or not created yet; use Deploy link)`,
  }
}

export function App(): ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [state, setState] = useState<PublicGameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiLine, setApiLine] = useState<string>('Resolving API…')

  useEffect(() => {
    let cancelled = false
    let s: Socket | null = null

    const attach = (origin: string) => {
      if (cancelled) return
      s = io(origin, { path: '/socket.io' })
      setSocket(s)
      s.on('connect', () => setError(null))
      s.on('connect_error', () =>
        setError(
          import.meta.env.DEV
            ? 'Cannot reach game server. From repo root run `npm run dev` so the API runs on port 3001 (or set VITE_DEV_SERVER_URL in .env).'
            : `Cannot reach game server at ${origin}. Create the API on Render (Deploy link below). On the service set environment CLIENT_ORIGIN=${window.location.origin} then wait for the instance to wake (~1 min on free tier).`,
        ),
      )
      s.on('roomJoined', (p) => {
        setRoomCode(p.roomCode)
        setPlayerId(p.playerId)
        setState(p.state)
        setError(null)
      })
      s.on('state', setState)
      s.on('error', (msg: string) => setError(msg))
    }

    void (async () => {
      if (import.meta.env.DEV) {
        const origin = window.location.origin
        setApiLine(`${origin} (Vite proxy → Socket.IO)`)
        attach(origin)
        return
      }

      const r = await resolveProductionSocket()
      if (cancelled) return
      if (!r.ok) {
        setApiLine('(not connected)')
        setError(r.message)
        return
      }
      setApiLine(r.label)
      attach(r.url)
    })()

    return () => {
      cancelled = true
      s?.disconnect()
      setSocket(null)
    }
  }, [])

  const createRoom = useCallback(() => {
    socket?.emit('createRoom')
  }, [socket])

  const joinRoom = useCallback(() => {
    if (!socket || !joinInput.trim()) return
    socket.emit('joinRoom', joinInput)
  }, [socket, joinInput])

  const rematch = useCallback(() => {
    socket?.emit('rematch')
  }, [socket])

  const showBoard = state && roomCode

  const title = useMemo(() => {
    if (!roomCode) return 'Soccer Snake'
    return `Room ${roomCode}`
  }, [roomCode])

  return (
    <div className="shell">
      <header>
        <h1>{title}</h1>
        <p className="sub">
          Grid soccer meets Snake — online 1v1. First to <strong>{WIN_SCORE}</strong> points wins
          (goals or elimination).
        </p>
      </header>

      <div className="panel">
        <div className="row" style={{ marginBottom: '0.65rem' }}>
          <button type="button" onClick={createRoom} disabled={!socket}>
            Create room
          </button>
          <input
            type="text"
            placeholder="ROOM CODE"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            maxLength={6}
            aria-label="Room code"
          />
          <button type="button" className="secondary" onClick={joinRoom} disabled={!socket}>
            Join
          </button>
        </div>
        {error ? <div className="err">{error}</div> : null}
        {!import.meta.env.DEV && error ? (
          <p className="sub" style={{ marginTop: '0.35rem' }}>
            <a href={DEPLOY_RENDER_HREF} target="_blank" rel="noreferrer">
              Deploy the game API on Render (GitHub repo)
            </a>
          </p>
        ) : null}
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          API: <code style={{ wordBreak: 'break-all' }}>{apiLine}</code>
          {playerId ? (
            <>
              {' '}
              · You: <code>{playerId.slice(0, 8)}…</code>
            </>
          ) : null}
        </div>
      </div>

      {showBoard && state ? (
        <GameBoard
          state={state}
          selfId={playerId!}
          onDirection={(dir) => socket?.emit('setDirection', dir)}
          onRematch={rematch}
        />
      ) : (
        <p className="sub">Create a room and share the code, or join a friend.</p>
      )}
    </div>
  )
}
