/** Wire format + simulation types shared by client and server. */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Vec2 {
  x: number
  y: number
}

export interface PublicGameState {
  grid: { width: number; height: number }
  players: PublicPlayer[]
  ball: Vec2
  carrierId: string | null
  scores: Record<string, number>
  phase: 'lobby' | 'playing' | 'round_over' | 'match_over'
  winnerId: string | null
  tick: number
  /** Goal columns: player scores when ball ends on their attack edge */
  attackRight: string
  attackLeft: string
  /** Human-readable messages */
  lastEvent: string | null
}

export interface PublicPlayer {
  id: string
  segments: Vec2[]
  color: string
  /** Shown above the snake head */
  displayName: string
}

export interface ServerToClientEvents {
  state: (s: PublicGameState) => void
  roomJoined: (p: {
    roomCode: string
    playerId: string
    state: PublicGameState
  }) => void
  error: (msg: string) => void
}

/** Object payloads avoid Socket.IO argument-order edge cases in the wild. */
export interface CreateRoomPayload {
  displayName: string
}

export interface JoinRoomPayload {
  code: string
  displayName: string
}

export interface ClientToServerEvents {
  /** String is a legacy shape; prefer `CreateRoomPayload`. */
  createRoom: (payload: CreateRoomPayload | string) => void
  /**
   * Prefer `JoinRoomPayload` as a single argument.
   * Two string arguments are supported for older clients (`code`, `displayName`).
   */
  joinRoom: (
    codeOrPayload: string | JoinRoomPayload,
    displayName?: string,
  ) => void
  setDirection: (dir: Direction) => void
  rematch: () => void
}

export const GRID_W = 24
export const GRID_H = 18
export const WIN_SCORE = 5
export const SNAKE_LEN = 4
export const TICK_MS = 125
