import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react'
import { Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import type { PublicGameState } from '@soccer-snake/shared'
import { WIN_SCORE } from '@soccer-snake/shared'
import { GameBoard } from '../GameBoard.tsx'
import { getSocketOrigin } from '../gameApi.ts'
import { CANONICAL_CLIENT_URL } from '../site.ts'

/** One-click deploy for this GitHub repo (set `CLIENT_ORIGIN` in the dashboard after). */
const DEPLOY_RENDER_HREF =
  'https://render.com/deploy?repo=https://github.com/dynamit93/footbollsnakegame'

const DISPLAY_NAME_MAX = 24

export function SoccerSnakeApp(): ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
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
            : `Cannot reach game server at ${origin}. Create the API on Render (Deploy link below). Set CLIENT_ORIGIN on the API to ${CANONICAL_CLIENT_URL} (and any preview URLs you use). Wait ~1 min on free tier for cold start.`,
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
      try {
        const { origin, label } = await getSocketOrigin()
        if (cancelled) return
        setApiLine(label)
        attach(origin)
      } catch (e) {
        if (cancelled) return
        const msg =
          e instanceof Error ? e.message : 'Could not resolve game server URL.'
        setApiLine('(not connected)')
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
      s?.disconnect()
      setSocket(null)
    }
  }, [])

  const trimmedName = displayName.trim()
  const nameOk = trimmedName.length > 0 && trimmedName.length <= DISPLAY_NAME_MAX

  const createRoom = useCallback(() => {
    if (!socket || !nameOk) return
    socket.emit('createRoom', { displayName: trimmedName })
  }, [socket, trimmedName, nameOk])

  const joinRoom = useCallback(() => {
    if (!socket || !joinInput.trim() || !nameOk) return
    socket.emit('joinRoom', {
      code: joinInput.trim(),
      displayName: trimmedName,
    })
  }, [socket, joinInput, trimmedName, nameOk])

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
      <nav className="hub-nav">
        <Link to="/" className="hub-nav-link">
          ← Game Liberty
        </Link>
      </nav>
      <header>
        <h1>{title}</h1>
        <p className="sub">
          Grid soccer meets Snake — online 1v1. First to <strong>{WIN_SCORE}</strong> points wins
          (goals or elimination).
        </p>
      </header>

      <div className="panel">
        <div style={{ marginBottom: '0.65rem' }}>
          <label
            htmlFor="display-name"
            className="sub"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            placeholder="e.g. Alex"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="nickname"
            aria-label="Your display name"
            style={{ width: '100%', maxWidth: '16rem', marginBottom: '0.65rem' }}
          />
        </div>
        <div className="row" style={{ marginBottom: '0.65rem' }}>
          <button type="button" onClick={createRoom} disabled={!socket || !nameOk}>
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
          <button type="button" className="secondary" onClick={joinRoom} disabled={!socket || !nameOk}>
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
          Official site:{' '}
          <a href={`${CANONICAL_CLIENT_URL}/`} target="_blank" rel="noreferrer">
            {CANONICAL_CLIENT_URL}
          </a>
          <br />
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
