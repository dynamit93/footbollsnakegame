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

type SocketTarget = { url: string } | { block: string }

/** Dev: browser origin (Vite proxies /socket.io). Prod: VITE_SERVER_URL must be a different host (your Node API), not this Vercel app. */
function resolveSocketTarget(): SocketTarget {
  const raw = import.meta.env.VITE_SERVER_URL?.trim() ?? ''
  const fromEnv = raw.replace(/\/$/, '')

  if (import.meta.env.DEV) {
    return { url: window.location.origin }
  }

  if (!fromEnv) {
    return {
      block:
        'VITE_SERVER_URL is missing from this deployment. In Vercel → Settings → Environment Variables, add VITE_SERVER_URL with your API origin, save, then trigger a new Production deploy (Redeploy). Values are baked in at build time—not at runtime.',
    }
  }

  let apiOrigin: string
  try {
    apiOrigin = new URL(fromEnv).origin
  } catch {
    return { block: `VITE_SERVER_URL is not a valid URL: "${raw}". Use https://your-api-host.com with no path.` }
  }

  if (apiOrigin === window.location.origin) {
    return {
      block:
        'VITE_SERVER_URL is set to this same website (your Vercel frontend). That cannot work. Set it to the URL where you deployed the Node game server (repo folder /server)—for example https://something.onrender.com or https://something.railway.app—a different hostname from this page. Then redeploy this project.',
    }
  }

  return { url: fromEnv }
}

/** Label for the “API:” line in the footer. */
function apiConfigSummary(): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin} (Vite → proxy → Socket.IO API)`
  }
  const raw = import.meta.env.VITE_SERVER_URL?.trim()
  if (!raw) {
    return '(VITE_SERVER_URL was empty at build — redeploy after setting the env var)'
  }
  return raw.replace(/\/$/, '')
}

export function App(): ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [state, setState] = useState<PublicGameState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const target = resolveSocketTarget()
    if ('block' in target) {
      setError(target.block)
      return
    }
    const { url: origin } = target

    const s = io(origin, { path: '/socket.io' })
    setSocket(s)
    s.on('connect', () => setError(null))
    s.on('connect_error', () =>
      setError(
        import.meta.env.DEV
          ? 'Cannot reach game server. From repo root run `npm run dev` so the API runs on port 3001 (or set VITE_DEV_SERVER_URL in .env).'
          : `Cannot reach game server at ${origin}. Confirm the API is running, uses HTTPS if this page is HTTPS, and allows this origin in SERVER CORS (CLIENT_ORIGIN).`,
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
    return () => {
      s.disconnect()
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
          API / build config: <code>{apiConfigSummary()}</code>
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
