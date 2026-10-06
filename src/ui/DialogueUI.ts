// Encounter dialogue panel (spec §7, §10). Bottom-centre: speaker chip, 1–2
// lines, 2–3 tap-friendly choice buttons (₦ cost shown, greyed when
// unaffordable), and a countdown bar draining over ENCOUNTER_TIME real seconds.
// If the timer expires, the LAST choice (ignore/refuse) auto-fires. Never fully
// pauses the game — the world keeps moving in slow-mo behind it.

import { CONFIG } from '../config'
import type { EncounterDef } from '../encounters/types'

const SPEAKER_COLOR: Record<string, string> = {
  Officer: '#2563eb',
  Nero: '#c0271d',
  Agbero: '#2e9e4f',
}

export class DialogueUI {
  private readonly root: HTMLElement
  private el: HTMLElement | null = null
  private timer = 0
  private onChoose: ((index: number) => void) | null = null
  private def: EncounterDef | null = null
  private canAfford: ((cost: number | undefined) => boolean) | null = null

  constructor(root: HTMLElement) {
    this.root = root
  }

  get isOpen(): boolean {
    return this.el !== null
  }

  open(
    def: EncounterDef,
    canAfford: (cost: number | undefined) => boolean,
    onChoose: (index: number) => void,
  ): void {
    this.close()
    this.def = def
    this.canAfford = canAfford
    this.onChoose = onChoose

    const panel = document.createElement('div')
    panel.className = 'dlg'
    const color = SPEAKER_COLOR[def.speaker] ?? '#334155'
    const lines = def.lines.map((l) => `<p class="dlg-line">${l}</p>`).join('')
    const buttons = def.choices
      .map((c, i) => {
        const afford = canAfford(c.cost)
        const cost = c.cost ? ` <span class="dlg-cost">₦${c.cost}</span>` : ''
        return `<button type="button" class="dlg-choice" data-i="${i}" ${afford ? '' : 'disabled'}>
          <span class="dlg-num">${i + 1}</span>${c.label}${cost}</button>`
      })
      .join('')
    panel.innerHTML = `
      <div class="dlg-speaker" style="background:${color}">${def.speaker}</div>
      ${lines}
      <div class="dlg-choices">${buttons}</div>
      <div class="dlg-timer"><div class="dlg-timer-fill"></div></div>`

    this.root.appendChild(panel)
    this.el = panel

    panel.querySelectorAll<HTMLButtonElement>('.dlg-choice').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return
        this.pick(Number(b.dataset.i))
      })
    })

    // Drain the timer bar, then auto-pick the last (ignore) choice.
    const fill = panel.querySelector<HTMLElement>('.dlg-timer-fill')!
    fill.style.transition = `width ${CONFIG.ENCOUNTER_TIME}s linear`
    requestAnimationFrame(() => (fill.style.width = '0%'))
    this.timer = window.setTimeout(() => this.pick(def.choices.length - 1), CONFIG.ENCOUNTER_TIME * 1000)
  }

  /** Keyboard 1/2/3 → choice (ignored if unaffordable). */
  chooseByKey(n: number): void {
    if (!this.def || !this.canAfford) return
    const i = n - 1
    const choice = this.def.choices[i]
    if (!choice || !this.canAfford(choice.cost)) return
    this.pick(i)
  }

  private pick(index: number): void {
    const cb = this.onChoose
    this.close()
    cb?.(index)
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
    this.el?.remove()
    this.el = null
    this.onChoose = null
    this.def = null
    this.canAfford = null
  }
}
