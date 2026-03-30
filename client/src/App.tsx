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

function serverUrl(): string {
  return import.meta.env.VITE_SERVER_URL || window.location.origin
}

export function App(): ReactElement {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [state, setState] = useState<PublicGameState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const s = io(serverUrl(), { path: '/socket.io' })
    setSocket(s)
    s.on('connect', () => setError(null))
    s.on('connect_error', () =>
      setError(
        'Cannot reach game server. Start the server (npm run dev from repo root) and check the port.',
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
          Server: <code>{serverUrl()}</code>
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
