import { useCallback, useEffect, useRef, type ReactElement } from 'react'
import type {
  Direction,
  PublicGameState,
  PublicPlayer,
  Vec2,
} from '@soccer-snake/shared'

const keyToDir = (k: string): Direction | null => {
  if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'up'
  if (k === 'ArrowDown' || k === 's' || k === 'S') return 'down'
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'left'
  if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'right'
  return null
}

function Cell(props: {
  x: number
  y: number
  w: number
  players: PublicGameState['players']
  ball: PublicGameState['ball']
}): ReactElement {
  const { x, y, w, players, ball } = props
  const isGoalL = x === 0
  const isGoalR = x === w - 1
  let snakeHead = false
  let snakeColor: string | null = null
  let snakeTail = false
  let headLabel = ''
  for (const p of players) {
    if (p.segments.length === 0) continue
    const idx = p.segments.findIndex((s: Vec2) => s.x === x && s.y === y)
    if (idx === 0) {
      snakeHead = true
      snakeColor = p.color
      headLabel = p.displayName || 'Player'
    } else if (idx > 0) {
      snakeTail = true
      snakeColor = p.color
    }
  }
  const ballHere = ball.x === x && ball.y === y
  const classes = ['cell']
  if (isGoalL) classes.push('goal-left')
  if (isGoalR) classes.push('goal-right')
  if (ballHere) classes.push('ball')

  return (
    <div
      className={classes.join(' ')}
      title={`${x},${y}`}
      style={
        snakeColor
          ? {
              background: snakeColor,
              opacity: snakeTail && !snakeHead ? 0.85 : 1,
            }
          : undefined
      }
    >
      {snakeHead ? (
        <div className="snake-head-wrap">
          <span className="player-name-tag">{headLabel}</span>
          <div
            className="snake-head"
            style={{ width: '100%', height: '100%', borderRadius: 4 }}
          />
        </div>
      ) : null}
    </div>
  )
}

export function GameBoard(props: {
  state: PublicGameState
  selfId: string
  onDirection: (d: Direction) => void
  onRematch: () => void
}): ReactElement {
  const { state, selfId, onDirection, onRematch } = props
  const { grid, players, ball, phase, scores, winnerId, lastEvent } = state
  const lastDir = useRef<Direction | null>(null)

  const sendDir = useCallback(
    (d: Direction) => {
      if (phase !== 'playing') return
      if (lastDir.current === d) return
      lastDir.current = d
      onDirection(d)
    },
    [onDirection, phase],
  )

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const d = keyToDir(e.key)
      if (!d) return
      e.preventDefault()
      sendDir(d)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [sendDir])

  const opp = players.find((p: PublicPlayer) => p.id !== selfId)
  const me = players.find((p: PublicPlayer) => p.id === selfId)

  return (
    <section>
      <div className="hud">
        <span className="pill">
          Phase: <strong>{phase}</strong>
        </span>
        {me ? (
          <span className="pill tag-you">
            You ({me.displayName}): {scores[selfId] ?? 0}{' '}
            {state.carrierId === selfId ? '(have ball)' : ''}
          </span>
        ) : null}
        {opp ? (
          <span className="pill">
            {opp.displayName}: {scores[opp.id] ?? 0}{' '}
            {state.carrierId === opp.id ? '(has ball)' : ''}
          </span>
        ) : null}
        {phase === 'playing' ? (
          <>
            <span className="pill">
              Scores on <strong>right edge</strong>:{' '}
              <code>{state.attackRight.slice(0, 6)}…</code>
            </span>
            <span className="pill">
              Scores on <strong>left edge</strong>:{' '}
              <code>{state.attackLeft.slice(0, 6)}…</code>
            </span>
          </>
        ) : null}
      </div>
      {lastEvent ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{lastEvent}</p>
      ) : null}

      <div className="board-wrap">
        <div
          className="board"
          style={{
            gridTemplateColumns: `repeat(${grid.width}, 1fr)`,
          }}
        >
          {Array.from({ length: grid.height * grid.width }, (_, i) => {
            const x = i % grid.width
            const y = Math.floor(i / grid.width)
            return (
              <Cell
                key={`${x}-${y}`}
                x={x}
                y={y}
                w={grid.width}
                players={players}
                ball={ball}
              />
            )
          })}
        </div>
      </div>

      <p className="sub" style={{ marginTop: '0.75rem' }}>
        Controls: <kbd>WASD</kbd> or arrow keys. Your head has a light outline.
      </p>

      {phase === 'match_over' ? (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <p>
            Match over — winner:{' '}
            <strong>
              {winnerId
                ? (players.find((p) => p.id === winnerId)?.displayName ?? '—')
                : '—'}
            </strong>
          </p>
          <button type="button" onClick={onRematch}>
            Rematch (reset scores)
          </button>
        </div>
      ) : null}
    </section>
  )
}
