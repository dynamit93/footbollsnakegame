import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

const EYE = 1.55
const SPEED = 32
const FLOOR = 42
const WALL_H = 8
const MARGIN = 1.2

function disposeTargetsGroup(g: THREE.Group): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
      else o.material.dispose()
    }
  })
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
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [message, setMessage] = useState<string | null>('Click the viewport, then look and shoot.')
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0618)
    scene.fog = new THREE.Fog(0x0d0618, 22, 52)

    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 120)
    camera.position.set(0, EYE, 12)

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

    const raycaster = new THREE.Raycaster()
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

    const shoot = () => {
      if (!controls.isLocked) return
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
      const hits = raycaster.intersectObjects(targets.children, false)
      if (hits.length === 0) return
      const mesh = hits[0]!.object as THREE.Mesh
      if (!mesh.userData.isTarget) return
      targets.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      setScore((s) => s + 100)
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

    const onCanvasClick = () => {
      if (!controls.isLocked) void controls.lock()
      else shoot()
    }
    renderer.domElement.addEventListener('click', onCanvasClick)

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
      const mz = Number(keyDown.has('KeyS')) - Number(keyDown.has('KeyW'))
      if (controls.isLocked) {
        vel.x -= mx * SPEED * delta
        vel.z -= mz * SPEED * delta
        controls.moveRight(-vel.x * delta)
        controls.moveForward(-vel.z * delta)
        clampCam()
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
      renderer.domElement.removeEventListener('click', onCanvasClick)
      controls.removeEventListener('lock', onLock)
      controls.removeEventListener('unlock', onUnlock)
      controls.dispose()
      disposeTargetsGroup(targets)
      scene.remove(targets)
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="fps-page">
      <div className="fps-topbar">
        <Link to="/" className="hub-nav-link">
          ← Game Liberty
        </Link>
        <div className="fps-stats">
          <span>Score {score}</span>
          <span>Wave {wave}</span>
          {!locked ? <span className="fps-hint">Click arena to capture mouse</span> : null}
        </div>
      </div>
      <div ref={hostRef} className="fps-host" role="application" aria-label="Neon Hollow FPS view" />
      {message ? <div className="fps-toast">{message}</div> : null}
      <div className="fps-crosshair" aria-hidden="true" />
      <aside className="fps-help">
        <strong>Controls</strong>
        <ul>
          <li>W A S D — move</li>
          <li>Mouse — look (after lock)</li>
          <li>Click — shoot center ray</li>
          <li>R (menu) — reset run</li>
        </ul>
      </aside>
    </div>
  )
}
