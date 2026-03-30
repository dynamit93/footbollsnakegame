import http from 'node:http'
import process from 'node:process'
import cors from 'cors'
import express from 'express'
import { Server } from 'socket.io'
import {
  GRID_H,
  GRID_W,
  TICK_MS,
  type ClientToServerEvents,
  type Direction,
  type JoinRoomPayload,
  type PublicGameState,
  type ServerToClientEvents,
} from '@soccer-snake/shared'
import { createInitialSim, stepSim, toPublicState, type SimState } from './simulation.js'

const PORT = Number(process.env.PORT) || 3001
const rawOrigin = process.env.CLIENT_ORIGIN
const CLIENT_ORIGIN =
  rawOrigin === undefined || rawOrigin === ''
    ? '*'
    : rawOrigin.split(',').map((s) => s.trim())

const PLAYER_COLORS = ['#38bdf8', '#fb7185']

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]!
  return s
}

interface Room {
  code: string
  /** Join order — determines spawn side */
  sockets: string[]
  sim: SimState | null
  pendingInput: Record<string, Direction | undefined>
  tickTimer: ReturnType<typeof setInterval> | null
  displayNames: Record<string, string>
}

const rooms = new Map<string, Room>()
const socketRoom = new Map<string, string>()

const DISPLAY_NAME_MAX = 24

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .slice(0, DISPLAY_NAME_MAX)
    .replace(/[\u0000-\u001f\u007f]/g, '')
}

/** Replace socket ids in sim messages with display names (longest id first). */
function humanizeLastEvent(
  msg: string | null,
  names: Record<string, string>,
): string | null {
  if (msg == null) return msg
  let out = msg
  const ids = Object.keys(names).sort((a, b) => b.length - a.length)
  for (const id of ids) {
    if (!id || !out.includes(id)) continue
    const label = sanitizeDisplayName(names[id]) || 'Player'
    out = out.split(id).join(label)
  }
  return out
}

function finalizePublicState(pub: PublicGameState, room: Room): PublicGameState {
  const names = room.displayNames ?? {}
  return {
    ...pub,
    players: pub.players.map((p) => {
      const n = sanitizeDisplayName(names[p.id])
      return {
        ...p,
        displayName: n || 'Player',
      }
    }),
    lastEvent: humanizeLastEvent(pub.lastEvent, names),
  }
}

function lobbyPublic(room: Room): PublicGameState {
  const players = room.sockets.map((id, i) => ({
    id,
    segments: [] as { x: number; y: number }[],
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    displayName: '',
  }))
  const scores: Record<string, number> = {}
  for (const id of room.sockets) scores[id] = 0
  return {
    grid: { width: GRID_W, height: GRID_H },
    players,
    ball: { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) },
    carrierId: null,
    scores,
    phase: 'lobby',
    winnerId: null,
    tick: 0,
    attackRight: room.sockets[0] ?? '',
    attackLeft: room.sockets[1] ?? '',
    lastEvent:
      room.sockets.length < 2 ? 'Waiting for second player…' : 'Starting…',
  }
}

function emitRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): void {
  const base: PublicGameState =
    room.sim && room.sockets.length === 2
      ? toPublicState(room.sim)
      : lobbyPublic(room)
  const pub = finalizePublicState(base, room)
  io.to(room.code).emit('state', pub)
}

function stopTick(room: Room): void {
  if (room.tickTimer) {
    clearInterval(room.tickTimer)
    room.tickTimer = null
  }
}

function startTick(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): void {
  stopTick(room)
  room.tickTimer = setInterval(() => {
    if (!room.sim) return
    if (room.sim.phase !== 'playing') {
      stopTick(room)
      return
    }
    room.sim = stepSim(room.sim, { ...room.pendingInput })
    room.pendingInput = {}
    if (room.sim.phase === 'match_over') stopTick(room)
    emitRoom(io, room)
  }, TICK_MS)
}

function ensureMatchStarted(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): void {
  if (room.sockets.length < 2) {
    stopTick(room)
    room.sim = null
    emitRoom(io, room)
    return
  }
  if (!room.sim) {
    room.sim = createInitialSim([room.sockets[0]!, room.sockets[1]!])
    room.pendingInput = {}
    startTick(io, room)
    emitRoom(io, room)
  }
}

function leaveRoom(socketId: string, ioServer: Server<ClientToServerEvents, ServerToClientEvents>): void {
  const code = socketRoom.get(socketId)
  if (!code) return
  const room = rooms.get(code)
  socketRoom.delete(socketId)
  if (!room) return

  stopTick(room)
  delete room.displayNames[socketId]
  room.sockets = room.sockets.filter((id) => id !== socketId)
  void ioServer.sockets.sockets.get(socketId)?.leave(code)
  room.sim = null
  room.pendingInput = {}

  if (room.sockets.length === 0) {
    rooms.delete(code)
    return
  }

  emitRoom(ioServer, room)
}

const app = express()
app.use(
  cors({
    origin:
      CLIENT_ORIGIN === '*'
        ? true
        : CLIENT_ORIGIN.length === 1
          ? CLIENT_ORIGIN[0]
          : CLIENT_ORIGIN,
  }),
)
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const httpServer = http.createServer(app)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin:
      CLIENT_ORIGIN === '*'
        ? true
        : CLIENT_ORIGIN.length === 1
          ? CLIENT_ORIGIN[0]
          : CLIENT_ORIGIN,
  },
})

io.on('connection', (socket) => {
  socket.on('createRoom', (payload) => {
    const rawName =
      typeof payload === 'string'
        ? payload
        : payload &&
            typeof payload === 'object' &&
            payload !== null &&
            'displayName' in payload
          ? (payload as { displayName: unknown }).displayName
          : undefined
    const name = sanitizeDisplayName(rawName)
    if (!name) {
      socket.emit('error', 'Enter your name (1–24 characters).')
      return
    }
    leaveRoom(socket.id, io)
    let code = randomRoomCode()
    while (rooms.has(code)) code = randomRoomCode()
    const room: Room = {
      code,
      sockets: [socket.id],
      sim: null,
      pendingInput: {},
      tickTimer: null,
      displayNames: { [socket.id]: name },
    }
    rooms.set(code, room)
    socketRoom.set(socket.id, code)
    void socket.join(code)
    const pub = finalizePublicState(lobbyPublic(room), room)
    socket.emit('roomJoined', { roomCode: code, playerId: socket.id, state: pub })
    io.to(code).emit('state', pub)
  })

  socket.on('joinRoom', (codeOrPayload, displayNameArg) => {
    let rawCode: string
    let rawName: unknown
    if (typeof codeOrPayload === 'string' && displayNameArg !== undefined) {
      rawCode = codeOrPayload
      rawName = displayNameArg
    } else if (
      codeOrPayload &&
      typeof codeOrPayload === 'object' &&
      'code' in codeOrPayload &&
      'displayName' in codeOrPayload
    ) {
      const p = codeOrPayload as JoinRoomPayload
      rawCode = typeof p.code === 'string' ? p.code : String(p.code)
      rawName = p.displayName
    } else {
      socket.emit('error', 'Invalid join request.')
      return
    }
    const name = sanitizeDisplayName(rawName)
    if (!name) {
      socket.emit('error', 'Enter your name (1–24 characters).')
      return
    }
    const code = rawCode.trim().toUpperCase()
    const room = rooms.get(code)
    if (!room) {
      socket.emit('error', 'Room not found')
      return
    }
    if (room.sockets.length >= 2) {
      socket.emit('error', 'Room is full')
      return
    }
    if (room.sockets.includes(socket.id)) {
      socket.emit('error', 'Already in room')
      return
    }
    leaveRoom(socket.id, io)
    room.sockets.push(socket.id)
    room.displayNames[socket.id] = name
    socketRoom.set(socket.id, code)
    void socket.join(code)
    ensureMatchStarted(io, room)
    const r = rooms.get(code)!
    const base =
      r.sim && r.sockets.length === 2 ? toPublicState(r.sim) : lobbyPublic(r)
    const pub = finalizePublicState(base, r)
    socket.emit('roomJoined', { roomCode: code, playerId: socket.id, state: pub })
    io.to(code).emit('state', pub)
  })

  socket.on('setDirection', (dir) => {
    const code = socketRoom.get(socket.id)
    if (!code) return
    const room = rooms.get(code)
    if (!room?.sim) return
    room.pendingInput[socket.id] = dir
  })

  socket.on('rematch', () => {
    const code = socketRoom.get(socket.id)
    if (!code) return
    const room = rooms.get(code)
    if (!room || room.sockets.length < 2 || !room.sim) return
    if (room.sim.phase !== 'match_over') return
    stopTick(room)
    const [a, b] = room.sockets
    room.sim = createInitialSim([a!, b!])
    room.pendingInput = {}
    startTick(io, room)
    emitRoom(io, room)
  })

  socket.on('disconnect', () => {
    leaveRoom(socket.id, io)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Soccer Snake server listening on ${PORT}`)
})
