import './style.css'
import { initAuth, userScopeKey } from './auth'
import { mountAuthControls } from './authUI'
import { Game } from './core/Game'

// --- Shell markup: a top bar with auth controls + the game canvas mount. -----
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <span class="brand">NAIJA&nbsp;RUN</span>
    <nav id="auth-controls" class="auth-controls" aria-label="Account"></nav>
  </header>
  <main id="game" class="game"></main>
`

// --- Clerk: load in the background so gameplay never blocks on auth. ---------
// If Clerk is down/offline the game still runs; only the sign-in controls and
// per-user best-distance namespace are affected.
void initAuth()
  .then(() => mountAuthControls(document.getElementById('auth-controls')!))
  .catch((e) => console.warn('Auth unavailable; continuing as guest.', e))

// --- Best-distance persistence, namespaced per signed-in user. ---------------
function readBest(): number {
  try {
    return Number(localStorage.getItem(userScopeKey('naijaRun.bestDistance')) ?? 0)
  } catch {
    return 0
  }
}
function writeBest(v: number): void {
  try {
    localStorage.setItem(userScopeKey('naijaRun.bestDistance'), String(Math.round(v)))
  } catch {
    // Storage unavailable (private mode) — best is simply not persisted.
  }
}

// --- Boot the game. ----------------------------------------------------------
new Game({
  mount: document.getElementById('game')!,
  readBest,
  writeBest,
})
