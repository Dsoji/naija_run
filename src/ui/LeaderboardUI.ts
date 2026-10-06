// Renders the leaderboard panel inside an end-of-run screen: a submit (or
// sign-in) control plus the top runs. All async, with loading/error states; if
// no backend is configured it renders nothing so the screen stays clean.

import type { Leaderboard, ScoreRow } from '../net/Leaderboard'

export interface LbOptions {
  lb: Leaderboard
  signedIn: boolean
  canSubmit: boolean // signed in and not yet submitted this run
  onSubmit: () => Promise<void>
  onSignIn: () => void
}

export function renderLeaderboard(container: HTMLElement, o: LbOptions): void {
  if (!o.lb.enabled) return

  const panel = document.createElement('div')
  panel.className = 'lb'
  panel.innerHTML = `
    <h3 class="lb-title">Leaderboard</h3>
    <div class="lb-action"></div>
    <ol class="lb-list"><li class="lb-note">Loading…</li></ol>`
  container.appendChild(panel)

  const action = panel.querySelector<HTMLElement>('.lb-action')!
  const list = panel.querySelector<HTMLElement>('.lb-list')!

  const refresh = async (): Promise<void> => {
    try {
      renderRows(list, await o.lb.top(15))
    } catch {
      list.innerHTML = '<li class="lb-note">Leaderboard unavailable</li>'
    }
  }

  if (o.canSubmit) {
    const b = makeButton('Submit my score', async () => {
      b.disabled = true
      b.textContent = 'Saving…'
      try {
        await o.onSubmit()
        b.textContent = 'Saved ✓'
      } catch {
        b.textContent = 'Save failed — retry'
        b.disabled = false
        return
      }
      void refresh()
    })
    action.appendChild(b)
  } else if (!o.signedIn) {
    action.appendChild(makeButton('Sign in to save your score', () => o.onSignIn()))
  }

  void refresh()
}

function renderRows(list: HTMLElement, rows: ScoreRow[]): void {
  if (rows.length === 0) {
    list.innerHTML = '<li class="lb-note">No scores yet — be the first!</li>'
    return
  }
  list.innerHTML = rows
    .map(
      (r, i) => `
      <li class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(r.name)}${r.caught ? ' 🏁' : ''}</span>
        <span class="lb-score">${r.score.toLocaleString()}</span>
      </li>`,
    )
    .join('')
}

function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'screen-btn lb-btn'
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}
