import {
  type Direction,
  type PublicGameState,
  type PublicPlayer,
  type Vec2,
  GRID_W,
  GRID_H,
  WIN_SCORE,
  SNAKE_LEN,
} from '@soccer-snake/shared'

const OPP: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

const PLAYER_COLORS = ['#38bdf8', '#fb7185']

export interface InternalPlayer {
  id: string
  segments: Vec2[]
  direction: Direction
  alive: boolean
}

export interface SimState {
  grid: { width: number; height: number }
  players: InternalPlayer[]
  ball: Vec2
  carrierId: string | null
  scores: Record<string, number>
  phase: PublicGameState['phase']
  winnerId: string | null
  tick: number
  /** [left-spawn, right-spawn] — index 0 attacks right goal */
  playerOrder: [string, string]
  lastEvent: string | null
}

function vecEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

function inBounds(p: Vec2, w: number, h: number): boolean {
  return p.x >= 0 && p.x < w && p.y >= 0 && p.y < h
}

function head(p: InternalPlayer): Vec2 {
  return p.segments[0]!
}

function movePoint(p: Vec2, d: Direction): Vec2 {
  switch (d) {
    case 'up':
      return { x: p.x, y: p.y - 1 }
    case 'down':
      return { x: p.x, y: p.y + 1 }
    case 'left':
      return { x: p.x - 1, y: p.y }
    case 'right':
      return { x: p.x + 1, y: p.y }
  }
}

function buildSnake(headPos: Vec2, direction: Direction, length: number): Vec2[] {
  const segs: Vec2[] = []
  let cur = { ...headPos }
  const back: Direction = OPP[direction]
  for (let i = 0; i < length; i++) {
    segs.push({ ...cur })
    if (i < length - 1) cur = movePoint(cur, back)
  }
  return segs
}

export function createInitialSim(playerOrder: [string, string]): SimState {
  const midY = Math.floor(GRID_H / 2)
  const p0Head = { x: 4, y: midY }
  const p1Head = { x: GRID_W - 5, y: midY }
  const players: InternalPlayer[] = [
    {
      id: playerOrder[0],
      segments: buildSnake(p0Head, 'right', SNAKE_LEN),
      direction: 'right',
      alive: true,
    },
    {
      id: playerOrder[1],
      segments: buildSnake(p1Head, 'left', SNAKE_LEN),
      direction: 'left',
      alive: true,
    },
  ]
  return {
    grid: { width: GRID_W, height: GRID_H },
    players,
    ball: { x: Math.floor(GRID_W / 2), y: midY },
    carrierId: null,
    scores: { [playerOrder[0]]: 0, [playerOrder[1]]: 0 },
    phase: 'playing',
    winnerId: null,
    tick: 0,
    playerOrder,
    lastEvent: null,
  }
}

function applyDirection(current: Direction, desired: Direction | undefined): Direction {
  if (!desired) return current
  if (OPP[current] === desired) return current
  return desired
}

function segmentCollision(
  newHead: Vec2,
  segments: Vec2[],
  skipTail: boolean,
): boolean {
  const last = skipTail ? segments.length - 1 : segments.length
  for (let i = 0; i < last; i++) {
    if (vecEq(newHead, segments[i]!)) return true
  }
  return false
}

export function stepSim(state: SimState, input: Record<string, Direction | undefined>): SimState {
  if (state.phase !== 'playing') return state

  const next: SimState = structuredClone(state)
  next.tick += 1
  next.lastEvent = null

  const [idLeft, idRight] = next.playerOrder
  const pById = new Map(next.players.map((p) => [p.id, p]))
  const p0 = pById.get(idLeft)!
  const p1 = pById.get(idRight)!

  const d0 = applyDirection(p0.direction, input[p0.id])
  const d1 = applyDirection(p1.direction, input[p1.id])
  p0.direction = d0
  p1.direction = d1

  const oldHead0 = { ...head(p0) }
  const oldHead1 = { ...head(p1) }
  const nh0 = movePoint(head(p0), d0)
  const nh1 = movePoint(head(p1), d1)

  let dead0 = !inBounds(nh0, GRID_W, GRID_H) || segmentCollision(nh0, p0.segments, true)
  let dead1 = !inBounds(nh1, GRID_W, GRID_H) || segmentCollision(nh1, p1.segments, true)

  if (vecEq(nh0, nh1)) {
    const c = next.carrierId
    if (c === p0.id) dead1 = true
    else if (c === p1.id) dead0 = true
    else {
      const first = p0.id < p1.id ? p0.id : p1.id
      if (first === p0.id) dead1 = true
      else dead0 = true
    }
  } else {
    if (!dead0 && p1.alive && segmentCollision(nh0, p1.segments, false)) dead0 = true
    if (!dead1 && p0.alive && segmentCollision(nh1, p0.segments, false)) dead1 = true
  }

  if (dead0 || dead1) {
    let survivor: InternalPlayer | null = null
    if (dead0 && !dead1) survivor = p1
    if (!dead0 && dead1) survivor = p0
    if (survivor) {
      next.scores[survivor.id] = (next.scores[survivor.id] ?? 0) + 1
      next.lastEvent = `Elimination — point to ${survivor.id.slice(0, 6)}`
      if (next.scores[survivor.id]! >= WIN_SCORE) {
        next.phase = 'match_over'
        next.winnerId = survivor.id
        return next
      }
    } else {
      next.lastEvent = 'Double elimination — no point'
    }
    return resetRound(next.playerOrder, next.scores)
  }

  const oldCarrier = next.carrierId
  const ballBefore = { ...next.ball }

  p0.segments = [nh0, ...p0.segments.slice(0, SNAKE_LEN - 1)]
  p1.segments = [nh1, ...p1.segments.slice(0, SNAKE_LEN - 1)]

  if (oldCarrier === p0.id) {
    next.ball = oldHead0
    next.carrierId = p0.id
  } else if (oldCarrier === p1.id) {
    next.ball = oldHead1
    next.carrierId = p1.id
  } else {
    next.ball = ballBefore
    next.carrierId = null
  }

  if (!next.carrierId) {
    if (vecEq(head(p0), next.ball)) {
      next.carrierId = p0.id
      next.ball = oldHead0
    } else if (vecEq(head(p1), next.ball)) {
      next.carrierId = p1.id
      next.ball = oldHead1
    }
  }

  const attackRight = idLeft
  const attackLeft = idRight

  const bx = next.ball.x
  if (bx === GRID_W - 1) {
    const scorer = attackRight
    next.scores[scorer] = (next.scores[scorer] ?? 0) + 1
    next.lastEvent = `Goal! ${scorer.slice(0, 6)} scores on the right`
    if (next.scores[scorer]! >= WIN_SCORE) {
      next.phase = 'match_over'
      next.winnerId = scorer
      return next
    }
    return resetRound(next.playerOrder, next.scores)
  }
  if (bx === 0) {
    const scorer = attackLeft
    next.scores[scorer] = (next.scores[scorer] ?? 0) + 1
    next.lastEvent = `Goal! ${scorer.slice(0, 6)} scores on the left`
    if (next.scores[scorer]! >= WIN_SCORE) {
      next.phase = 'match_over'
      next.winnerId = scorer
      return next
    }
    return resetRound(next.playerOrder, next.scores)
  }

  return next
}

function resetRound(playerOrder: [string, string], scores: Record<string, number>): SimState {
  const base = createInitialSim(playerOrder)
  base.scores = { ...scores }
  base.phase = 'playing'
  base.lastEvent = 'Round reset'
  return base
}

export function toPublicState(s: SimState): PublicGameState {
  const [idLeft, idRight] = s.playerOrder
  const pubPlayers: PublicPlayer[] = s.players.map((p, i) => ({
    id: p.id,
    segments: p.segments.map((c) => ({ ...c })),
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    displayName: '',
  }))
  return {
    grid: { ...s.grid },
    players: pubPlayers,
    ball: { ...s.ball },
    carrierId: s.carrierId,
    scores: { ...s.scores },
    phase: s.phase,
    winnerId: s.winnerId,
    tick: s.tick,
    attackRight: idLeft,
    attackLeft: idRight,
    lastEvent: s.lastEvent,
  }
}
