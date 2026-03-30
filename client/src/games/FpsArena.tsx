import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import type { FpsPlayerPose, FpsSpawn } from '@soccer-snake/shared'
import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { getSocketOrigin } from '../gameApi.ts'

const EYE = 1.55
const SPEED = 32
const FLOOR = 42
const WALL_H = 8
const MARGIN = 1.2
const DISPLAY_NAME_MAX = 24

function disposeTargetsGroup(g: THREE.Group): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
      else o.material.dispose()
    }
  })
}

function colorHexForId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return new THREE.Color().setHSL((h % 360) / 360, 0.7, 0.52).getHex()
}

function makeNameSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(12,8,24,0.78)'
  ctx.fillRect(0, 0, 512, 96)
  ctx.strokeStyle = 'rgba(167,139,250,0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 510, 94)
  ctx.fillStyle = '#f1f5f9'
  ctx.font = 'bold 40px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.slice(0, 18), 256, 48)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3.2, 0.62, 1)
  sprite.position.y = 2.05
  return sprite
}

function createRemoteAvatar(displayName: string, color: number): THREE.Group {
  const root = new THREE.Group()
  const cap = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.82, 6, 12),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.55,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    }),
  )
  cap.position.y = 0.85
  root.add(cap)
  root.add(makeNameSprite(displayName))
  return root
}

function randomTargetsGroup(count: number): THREE.Group {
  const g = new THREE.Group()
  const matBase = new THREE.MeshStandardMaterial({
    color: 0xff3366,
    emissive: 0x440011,
    metalness: 0.35,
    roughness: 0.45,
  })
  const inner = FLOOR / 2 - 3
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), matBase.clone())
    const x = (Math.random() * 2 - 1) * inner
    const z = (Math.random() * 2 - 1) * inner
    mesh.position.set(x, 1.1 + Math.random() * 0.4, z)
    mesh.userData.isTarget = true
    g.add(mesh)
  }
  matBase.dispose()
  return g
}

export function FpsArena(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef(1)
  const spawnRef = useRef<FpsSpawn | null>(null)
  const remotePosesRef = useRef<FpsPlayerPose[]>([])
  const socketRef = useRef<Socket | null>(null)

  const [socket, setSocket] = useState<Socket | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [apiLine, setApiLine] = useState<string>('Resolving API…')

  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [shotTick, setShotTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let s: Socket | null = null

    void (async () => {
      try {
        const { origin, label } = await getSocketOrigin()
        if (cancelled) return
        setApiLine(label)
        s = io(origin, { path: '/socket.io' })
        setSocket(s)
        socketRef.current = s
        s.on('connect', () => setError(null))
        s.on('connect_error', () =>
          setError(
            import.meta.env.DEV
              ? 'Cannot reach API. Run `npm run dev` from repo root so port 3001 is up (Vite proxies /socket.io).'
              : 'Cannot reach game server — check deployment and CLIENT_ORIGIN.',
          ),
        )
        s.on('fpsRoomJoined', (p) => {
          spawnRef.current = p.spawn
          remotePosesRef.current = []
          setRoomCode(p.roomCode)
          setPlayerId(p.playerId)
          setError(null)
          setMessage('Room ready — click the arena, then play.')
        })
        s.on('fpsState', (st) => {
          remotePosesRef.current = st.poses
        })
        s.on('error', (msg: string) => setError(msg))
      } catch (e) {
        if (cancelled) return
        setApiLine('(not connected)')
        setError(e instanceof Error ? e.message : 'No API URL')
      }
    })()

    return () => {
      cancelled = true
      socketRef.current?.emit('fpsLeaveRoom')
      socketRef.current = null
      s?.emit('fpsLeaveRoom')
      s?.disconnect()
      setSocket(null)
    }
  }, [])

  const trimmedName = displayName.trim()
  const nameOk = trimmedName.length > 0 && trimmedName.length <= DISPLAY_NAME_MAX

  const createFpsRoom = useCallback(() => {
    if (!socket || !nameOk) return
    socket.emit('fpsCreateRoom', { displayName: trimmedName })
  }, [socket, trimmedName, nameOk])

  const joinFpsRoom = useCallback(() => {
    if (!socket || !joinInput.trim() || !nameOk) return
    socket.emit('fpsJoinRoom', { code: joinInput.trim(), displayName: trimmedName })
  }, [socket, joinInput, trimmedName, nameOk])

  const leaveArena = useCallback(() => {
    socket?.emit('fpsLeaveRoom')
    setRoomCode(null)
    setPlayerId(null)
    setLocked(false)
    setMessage(null)
    remotePosesRef.current = []
  }, [socket])

  useEffect(() => {
    if (!roomCode || !playerId || !hostRef.current) return

    const host = hostRef.current
    const spawn = spawnRef.current
    if (!spawn) return

    const selfId = playerId
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0618)
    scene.fog = new THREE.Fog(0x0d0618, 22, 52)

    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 120)
    camera.rotation.order = 'YXZ'
    camera.position.set(spawn.x, EYE, spawn.z)
    camera.rotation.y = spawn.ry

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0x6b5cff, 0x1a0a24, 0.85)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xfff0dd, 1.1)
    dir.position.set(8, 18, 6)
    scene.add(dir)

    const floorGeom = new THREE.PlaneGeometry(FLOOR, FLOOR)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1530,
      metalness: 0.2,
      roughness: 0.85,
    })
    const floor = new THREE.Mesh(floorGeom, floorMat)
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const grid = new THREE.GridHelper(FLOOR, 28, 0x5c4ddb, 0x2a2050)
    grid.position.y = 0.01
    scene.add(grid)

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x120c22,
      metalness: 0.15,
      roughness: 0.9,
    })
    const half = FLOOR / 2
    const t = WALL_H / 2
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(FLOOR + 0.4, WALL_H, 0.6), wallMat)
    wallN.position.set(0, t, -half)
    const wallS = wallN.clone()
    wallS.position.set(0, t, half)
    const wallE = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, FLOOR + 0.4), wallMat)
    wallE.position.set(half, t, 0)
    const wallW = wallE.clone()
    wallW.position.set(-half, t, 0)
    scene.add(wallN, wallS, wallE, wallW)

    const controls = new PointerLockControls(camera, renderer.domElement)
    const onLock = () => {
      setLocked(true)
      setMessage(null)
    }
    const onUnlock = () => setLocked(false)
    controls.addEventListener('lock', onLock)
    controls.addEventListener('unlock', onUnlock)

    let targets = randomTargetsGroup(5 + waveRef.current * 2)
    scene.add(targets)

    const remoteMeshes = new Map<string, THREE.Group>()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 120
    const keyDown = new Set<string>()
    const onKey = (e: KeyboardEvent) => {
      keyDown.add(e.code)
      if (e.code === 'KeyR' && !controls.isLocked) {
        waveRef.current = 1
        setWave(1)
        setScore(0)
        disposeTargetsGroup(targets)
        scene.remove(targets)
        targets = randomTargetsGroup(5 + waveRef.current * 2)
        scene.add(targets)
        setMessage('Arena reset. Click to play.')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keyDown.delete(e.code)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)

    const vel = new THREE.Vector3()
    let lastPoseSent = 0

    const shoot = () => {
      if (!controls.isLocked) return
      setShotTick((t) => t + 1)

      camera.updateMatrixWorld()
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      const start = camera.position.clone().addScaledVector(dir, 0.35)
      const traceEnd = start.clone().addScaledVector(dir, raycaster.far)
      const traceGeo = new THREE.BufferGeometry().setFromPoints([start, traceEnd])
      const trace = new THREE.Line(
        traceGeo,
        new THREE.LineBasicMaterial({
          color: 0xfff6b8,
          transparent: true,
          opacity: 0.92,
        }),
      )
      scene.add(trace)
      window.setTimeout(() => {
        scene.remove(trace)
        traceGeo.dispose()
        ;(trace.material as THREE.Material).dispose()
      }, 90)

      const hits = raycaster.intersectObjects(targets.children, false)
      if (hits.length === 0) return
      const mesh = hits[0]!.object as THREE.Mesh
      if (!mesh.userData.isTarget) return
      const hitPoint = hits[0]!.point.clone()
      targets.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      setScore((s) => s + 100)

      const burstGeom = new THREE.SphereGeometry(0.28, 10, 10)
      const burstMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
      })
      const burst = new THREE.Mesh(burstGeom, burstMat)
      burst.position.copy(hitPoint)
      scene.add(burst)
      let burstFrames = 0
      const burstRaf = () => {
        burstFrames += 1
        burst.scale.multiplyScalar(1.18)
        burstMat.opacity = Math.max(0, 0.85 - burstFrames * 0.08)
        if (burstFrames < 10) requestAnimationFrame(burstRaf)
        else {
          scene.remove(burst)
          burstGeom.dispose()
          burstMat.dispose()
        }
      }
      requestAnimationFrame(burstRaf)

      if (targets.children.length === 0) {
        waveRef.current += 1
        setWave(waveRef.current)
        disposeTargetsGroup(targets)
        scene.remove(targets)
        targets = randomTargetsGroup(5 + waveRef.current * 2)
        scene.add(targets)
        setMessage(`Wave ${waveRef.current} — new targets.`)
        window.setTimeout(() => setMessage(null), 2200)
      }
    }

    const onCanvasMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (!controls.isLocked) {
        void controls.lock()
        return
      }
      shoot()
    }
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown)

    const clock = new THREE.Clock()
    let raf = 0

    const clampCam = () => {
      const halfIn = half - MARGIN
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfIn, halfIn)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -halfIn, halfIn)
      camera.position.y = EYE
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const delta = Math.min(clock.getDelta(), 0.05)
      vel.x -= vel.x * 9 * delta
      vel.z -= vel.z * 9 * delta
      const mx = Number(keyDown.has('KeyD')) - Number(keyDown.has('KeyA'))
      const mz = Number(keyDown.has('KeyW')) - Number(keyDown.has('KeyS'))
      if (controls.isLocked) {
        vel.x -= mx * SPEED * delta
        vel.z -= mz * SPEED * delta
        controls.moveRight(-vel.x * delta)
        controls.moveForward(-vel.z * delta)
        clampCam()
        const now = performance.now()
        if (now - lastPoseSent > 40 && socketRef.current) {
          lastPoseSent = now
          socketRef.current.emit('fpsPose', {
            x: camera.position.x,
            z: camera.position.z,
            ry: camera.rotation.y,
          })
        }
      }

      const poses = remotePosesRef.current
      const seenRemote = new Set<string>()
      for (const p of poses) {
        if (p.id === selfId) continue
        seenRemote.add(p.id)
        let grp = remoteMeshes.get(p.id)
        if (!grp) {
          grp = createRemoteAvatar(p.displayName, colorHexForId(p.id))
          scene.add(grp)
          remoteMeshes.set(p.id, grp)
        }
        grp.position.set(p.x, 0, p.z)
        grp.rotation.y = p.ry
      }
      for (const id of remoteMeshes.keys()) {
        if (!seenRemote.has(id)) {
          const grp = remoteMeshes.get(id)!
          scene.remove(grp)
          grp.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose()
              ;(o.material as THREE.Material).dispose()
            }
            if (o instanceof THREE.Sprite) {
              const m = o.material as THREE.SpriteMaterial
              m.map?.dispose()
              m.dispose()
            }
          })
          remoteMeshes.delete(id)
        }
      }

      renderer.render(scene, camera)
    }
    loop()

    const onResize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      camera.aspect = w / h || 1
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    onResize()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('mousedown', onCanvasMouseDown)
      controls.removeEventListener('lock', onLock)
      controls.removeEventListener('unlock', onUnlock)
      controls.dispose()
      disposeTargetsGroup(targets)
      scene.remove(targets)
      for (const grp of remoteMeshes.values()) {
        scene.remove(grp)
        grp.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose()
            ;(o.material as THREE.Material).dispose()
          }
          if (o instanceof THREE.Sprite) {
            const m = o.material as THREE.SpriteMaterial
            m.map?.dispose()
            m.dispose()
          }
        })
      }
      remoteMeshes.clear()
      renderer.dispose()
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
    }
  }, [roomCode, playerId])

  const inLobby = !roomCode || !playerId

  return (
    <div className="fps-page">
      <div className="fps-topbar">
        <Link to="/" className="hub-nav-link">
          ← Game Liberty
        </Link>
        <div className="fps-stats">
          {!inLobby ? (
            <>
              <span>
                Room <code>{roomCode}</code>
              </span>
              <span>Score {score}</span>
              <span>Wave {wave}</span>
              {!locked ? <span className="fps-hint">Click arena to capture mouse</span> : null}
            </>
          ) : (
            <span className="fps-hint">Join an arena to play (uses same API as Soccer Snake)</span>
          )}
        </div>
        {!inLobby ? (
          <button type="button" className="fps-leave" onClick={leaveArena}>
            Leave arena
          </button>
        ) : null}
      </div>

      {inLobby ? (
        <div className="shell fps-lobby">
          <nav className="hub-nav" style={{ marginBottom: '0.75rem' }}>
            <Link to="/games/soccer-snake" className="hub-nav-link">
              Soccer Snake (same backend) →
            </Link>
          </nav>
          <h1 className="fps-lobby-title">Neon Hollow</h1>
          <p className="sub">
            Multiplayer FPS — create an <strong>arena</strong> here and share that code (Neon Hollow
            rooms are separate from Soccer Snake match codes, but both use this same API).
            Others appear as glowing capsules with name tags. Targets and score are per player;
            movement syncs for everyone in the arena.
          </p>
          <div className="panel">
            <label htmlFor="fps-name" className="sub" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Your name
            </label>
            <input
              id="fps-name"
              type="text"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="nickname"
              style={{ width: '100%', maxWidth: '16rem', marginBottom: '0.65rem' }}
            />
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <button type="button" onClick={createFpsRoom} disabled={!socket || !nameOk}>
                Create arena
              </button>
              <input
                type="text"
                placeholder="ROOM CODE"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                maxLength={5}
                aria-label="Arena code"
              />
              <button type="button" className="secondary" onClick={joinFpsRoom} disabled={!socket || !nameOk}>
                Join
              </button>
            </div>
            {error ? <div className="err">{error}</div> : null}
            <p className="sub" style={{ fontSize: '0.82rem', marginBottom: 0 }}>
              API: <code style={{ wordBreak: 'break-all' }}>{apiLine}</code>
            </p>
          </div>
        </div>
      ) : null}

      <div
        ref={hostRef}
        className={'fps-host' + (inLobby ? ' fps-host--hidden' : '')}
        role="application"
        aria-label="Neon Hollow FPS view"
      />
      {message ? <div className="fps-toast">{message}</div> : null}
      {!inLobby ? (
        <div
          key={shotTick}
          className={`fps-crosshair${shotTick > 0 ? ' fps-crosshair--fired' : ''}`}
          aria-hidden="true"
        />
      ) : null}
      {!inLobby ? (
        <aside className="fps-help">
          <strong>Controls</strong>
          <ul>
            <li>W A S D — move</li>
            <li>Mouse — look (after lock)</li>
            <li>Left mouse — shoot (after lock)</li>
            <li>R (unlocked) — reset waves</li>
          </ul>
        </aside>
      ) : null}
    </div>
  )
}
