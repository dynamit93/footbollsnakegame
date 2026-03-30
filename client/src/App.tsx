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

type ResolveResult =
  | { ok: true; url: string; label: string }
  | { ok: false; message: string }

async function resolveProductionSocket(): Promise<ResolveResult> {
  const page = window.location.origin

  const envRaw = import.meta.env.VITE_SERVER_URL?.trim() ?? ''
  const fromEnv = usableApiUrl(envRaw, page)
  if (fromEnv) {
    return { ok: true, url: fromEnv, label: `${fromEnv} (VITE_SERVER_URL)` }
  }

  try {
    const res = await fetch('/socket-config.json', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as { apiOrigin?: string }
      const fromFile = usableApiUrl(data.apiOrigin ?? '', page)
      if (fromFile) {
        return {
          ok: true,
          url: fromFile,
          label: `${fromFile} (socket-config.json; Vercel env ignored if wrong)`,
        }
      }
    }
  } catch {
    /* no file */
  }

  const fromDefault = usableApiUrl(DEFAULT_RENDER_API, page)
  if (fromDefault) {
    return {
      ok: true,
      url: fromDefault,
      label: `${fromDefault} (built-in default — deploy API on Render or edit public/socket-config.json)`,
    }
  }

  if (envRaw) {
    try {
      if (new URL(normalizeOriginInput(envRaw)).origin === page) {
        return {
          ok: false,
          message:
            'VITE_SERVER_URL points at this Vercel site. Remove or fix it, set public/socket-config.json apiOrigin to your API, deploy the Node server, then redeploy.',
        }
      }
    } catch {
      /* fall through */
    }
  }

  return {
    ok: false,
    message:
      'No API URL found. Deploy the server (see README / render.yaml), set public/socket-config.json apiOrigin, or set VITE_SERVER_URL to that API (not this site), then redeploy.',
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
            : `Cannot reach game server at ${origin}. Deploy the API (Render/Railway), check /health, and set CLIENT_ORIGIN on the server to ${window.location.origin}`,
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
