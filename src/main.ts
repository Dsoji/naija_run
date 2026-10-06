import './style.css'
import * as THREE from 'three'
import { initAuth, userScopeKey, clerk } from './auth'
import { mountAuthControls } from './authUI'

// --- Shell markup: a top bar with auth controls + the game canvas mount. -----
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <span class="brand">NAIJA&nbsp;RUN</span>
    <nav id="auth-controls" class="auth-controls" aria-label="Account"></nav>
  </header>
  <main id="game" class="game">
    <div id="hud" class="hud"></div>
  </main>
`

// --- Clerk: load the client, then render visible sign-in/up/user controls. ---
await initAuth()
mountAuthControls(document.getElementById('auth-controls')!)

// --- Best-distance persistence, namespaced per signed-in user. ---------------
function readBest(): number {
  try {
    return Number(localStorage.getItem(userScopeKey('naijaRun.bestDistance')) ?? 0)
  } catch {
    return 0
  }
}

function renderHud(): void {
  const who = clerk.user
    ? (clerk.user.firstName ?? clerk.user.username ?? 'runner')
    : 'guest'
  document.getElementById('hud')!.textContent =
    `Signed in as ${who} · best distance: ${readBest()}m`
}
renderHud()
clerk.addListener(() => renderHud())

// --- Three.js placeholder scene (replaced by the real game in later phases). --
const game = document.getElementById('game')!
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0e1117)

const camera = new THREE.PerspectiveCamera(60, game.clientWidth / game.clientHeight, 0.1, 100)
camera.position.set(0, 1.5, 4)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(game.clientWidth, game.clientHeight)
game.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1))
const key = new THREE.DirectionalLight(0xffffff, 1.2)
key.position.set(3, 5, 2)
scene.add(key)

// A lone low-poly "runner" block — stand-in until Player.ts lands.
const runner = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 1.2, 0.8),
  new THREE.MeshStandardMaterial({ color: 0x16a34a }),
)
runner.position.y = 0.6
scene.add(runner)

scene.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x1f2937 }),
  ).rotateX(-Math.PI / 2),
)

function onResize(): void {
  camera.aspect = game.clientWidth / game.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(game.clientWidth, game.clientHeight)
}
window.addEventListener('resize', onResize)

const clock = new THREE.Clock()
function loop(): void {
  const t = clock.getElapsedTime()
  runner.rotation.y = t
  runner.position.y = 0.6 + Math.abs(Math.sin(t * 3)) * 0.25
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
loop()
