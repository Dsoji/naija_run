// Track generator (spec §3): keeps TILES_AHEAD tiles generated past the player
// and recycles tiles more than TILES_BEHIND behind. A coarse occupancy grid of
// cells prevents the path from overlapping itself. At a T-junction, generation
// pauses and short stubs are grown down BOTH branches; committing to a side
// appends that branch and disposes the other.

import * as THREE from 'three'
import { CONFIG } from '../config'
import {
  type Cell,
  type Side,
  type TileInfo,
  type TileType,
  type Vec2,
  buildTileMesh,
  cellCenter,
  cellKey,
  disposeTile,
  rotateLeft,
  rotateRight,
  step,
  turn,
} from './Tile'
import { addBridgePylon } from './Scenery'

const JUNCTION_STUB = 3 // tiles grown down each branch before the player commits

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export class Track {
  readonly committed: TileInfo[] = []
  private readonly occupied = new Set<string>()
  private pending: { junction: TileInfo; left: TileInfo[]; right: TileInfo[] } | null = null
  private straightsSinceJunction = 0
  private nextJunctionAt = 6
  private straightOnly = false
  private readonly scene: THREE.Scene
  private decorator: ((info: TileInfo) => void) | null = null
  private junctionListener: ((committed: TileInfo[]) => void) | null = null
  private marketExitListener: (() => void) | null = null
  private marketRemaining = 0
  private bridgeRemaining = 0
  private straightsSinceBridge = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** Register a callback that populates each STRAIGHT tile with obstacles/pickups. */
  setDecorator(fn: (info: TileInfo) => void): void {
    this.decorator = fn
  }

  /** Register a callback fired when a T-junction is created (it is the last
   *  committed tile at call time) — used to attach encounters ahead of it. */
  setJunctionListener(fn: (committed: TileInfo[]) => void): void {
    this.junctionListener = fn
  }

  /** Register a callback fired when a market shortcut section ends. */
  setMarketExitListener(fn: () => void): void {
    this.marketExitListener = fn
  }

  reset(): void {
    for (const t of this.committed) {
      this.scene.remove(t.group)
      disposeTile(t)
    }
    if (this.pending) this.disposeStubs([...this.pending.left, ...this.pending.right])
    this.committed.length = 0
    this.occupied.clear()
    this.pending = null
    this.straightsSinceJunction = 0
    this.nextJunctionAt = 6
    this.straightOnly = false
    this.marketRemaining = 0
    this.bridgeRemaining = 0
    this.straightsSinceBridge = 0

    // First tile: a straight heading north from the origin cell.
    const first = this.makeTile('STRAIGHT', { gx: 0, gz: 0 }, DIR_N, DIR_N)
    this.committed.push(first)
    this.ensureAhead(0)
  }

  /** Keep the path stocked ahead of the player and recycle what's behind.
   *  Returns how many tiles were removed from the front so the caller can
   *  adjust its current index. */
  update(currentIndex: number): number {
    this.ensureAhead(currentIndex)
    return this.recycle(currentIndex)
  }

  pendingJunction(): TileInfo | null {
    return this.pending?.junction ?? null
  }

  /** Commit the junction the player is on to one side. */
  commit(side: Side): void {
    if (!this.pending) return
    const { junction, left, right } = this.pending
    const chosen = side === 'L' ? left : right
    const other = side === 'L' ? right : left

    junction.exitDir = turn(junction.entryDir, side)
    junction.next = chosen[0]
    for (const t of chosen) this.committed.push(t)
    this.disposeStubs(other)

    // If this is Nero's market branch, continue laying market tiles beyond the
    // already-themed stubs until the section reaches MARKET_LEN.
    if (junction.shortcutBranch === side) {
      this.marketRemaining = Math.max(0, CONFIG.MARKET_LEN - chosen.length)
      if (this.marketRemaining === 0 && this.marketExitListener) this.marketExitListener()
    }

    this.pending = null
    // The stubs we just committed count as straights toward the next junction.
    this.straightsSinceJunction = chosen.length
    this.nextJunctionAt = randInt(CONFIG.JUNCTION_EVERY_MIN, CONFIG.JUNCTION_EVERY_MAX)
  }

  /** Clear everything ahead of `fromIndex` (which must be a STRAIGHT the player
   *  is on) and switch to straight-only generation — a clean finale runway. */
  makeRunway(fromIndex: number): void {
    if (this.pending) {
      this.disposeStubs([...this.pending.left, ...this.pending.right])
      this.pending = null
    }
    for (let i = this.committed.length - 1; i > fromIndex; i--) {
      const t = this.committed[i]
      this.scene.remove(t.group)
      disposeTile(t)
      this.occupied.delete(cellKey(t.cell))
    }
    this.committed.length = fromIndex + 1
    this.committed[fromIndex].next = undefined
    this.straightOnly = true
    this.nextJunctionAt = Number.POSITIVE_INFINITY
  }

  /** Turn the correct branch of the (still pending) junction into a market
   *  shortcut: re-theme its stub tiles and remember the branch so commit
   *  continues the market section. Called by the shortcut encounter effect. */
  startShortcut(junction: TileInfo): void {
    if (!this.pending || this.pending.junction !== junction) return
    const side = junction.correct ?? 'L'
    junction.shortcutBranch = side
    const stubs = side === 'L' ? this.pending.left : this.pending.right
    for (const t of stubs) this.themeAsMarket(t)
  }

  /** Rebuild a tile as a market tile (dispose old road/decor/obstacles). */
  private themeAsMarket(tile: TileInfo): void {
    for (const c of [...tile.group.children]) {
      tile.group.remove(c)
      c.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
    }
    tile.obstacles = []
    tile.pickups = []
    tile.type = 'MARKET_ENTRY'
    tile.market = true
    const mesh = buildTileMesh('MARKET_ENTRY', tile.entryDir, [tile.exitDir])
    for (const c of [...mesh.children]) tile.group.add(c)
    if (this.decorator) this.decorator(tile)
  }

  // --- generation ----------------------------------------------------------

  private ensureAhead(currentIndex: number): void {
    while (!this.pending && this.committed.length - currentIndex - 1 < CONFIG.TILES_AHEAD) {
      this.appendNext()
    }
  }

  private appendNext(): void {
    const after = this.committed[this.committed.length - 1]
    const entry = after.exitDir
    const cell = step(after.cell, entry)

    // Market shortcut section: lay market tiles until the section is done.
    if (this.marketRemaining > 0) {
      const t = this.makeTile('MARKET_ENTRY', cell, entry, entry)
      t.market = true
      this.pushTile(t, after)
      this.marketRemaining--
      if (this.marketRemaining === 0 && this.marketExitListener) this.marketExitListener()
      return
    }

    // Finale runway: straights only, no turns or junctions.
    if (this.straightOnly) {
      this.pushTile(this.makeTile('STRAIGHT', cell, entry, entry), after)
      return
    }

    // Count tiles toward the next Ikoyi Link Bridge crossing.
    this.straightsSinceBridge++

    // Start a bridge crossing after running a while (straight-only section).
    if (this.bridgeRemaining === 0 && this.straightsSinceBridge >= CONFIG.BRIDGE_EVERY && this.canPlace(cell, after.cell)) {
      this.bridgeRemaining = CONFIG.BRIDGE_LEN
      this.straightsSinceBridge = 0
    }

    // Bridge section in progress: lay BRIDGE tiles; pylon on the middle one.
    if (this.bridgeRemaining > 0) {
      const idx = CONFIG.BRIDGE_LEN - this.bridgeRemaining
      const t = this.makeTile('BRIDGE', cell, entry, entry)
      t.bridge = true
      if (idx === (CONFIG.BRIDGE_LEN >> 1)) addBridgePylon(t.group, entry)
      this.pushTile(t, after)
      this.bridgeRemaining--
      return
    }

    // Time for a junction?
    if (this.straightsSinceJunction >= this.nextJunctionAt && this.tryJunction(after, cell, entry)) {
      return
    }

    // Maybe a forced turn.
    if (Math.random() < CONFIG.FORCED_TURN_CHANCE) {
      const side = this.pickTurnSide(cell, entry)
      if (side) {
        const exit = turn(entry, side)
        this.pushTile(this.makeTile(side === 'L' ? 'TURN_L' : 'TURN_R', cell, entry, exit), after)
        this.straightsSinceJunction++ // a turn still spaces junctions out
        return
      }
    }

    // Default: straight, as long as it stays clear of other streets. If it
    // would run adjacent to (or over) an existing road, turn away instead.
    if (this.canPlace(cell, after.cell)) {
      this.pushTile(this.makeTile('STRAIGHT', cell, entry, entry), after)
      this.straightsSinceJunction++
      return
    }
    const side = this.pickTurnSide(cell, entry)
    if (side) {
      const exit = turn(entry, side)
      this.pushTile(this.makeTile(side === 'L' ? 'TURN_L' : 'TURN_R', cell, entry, exit), after)
    } else {
      // Fully boxed in (extremely rare): accept the overlap rather than stall.
      this.pushTile(this.makeTile('STRAIGHT', cell, entry, entry), after)
    }
    this.straightsSinceJunction++
  }

  /** Try to place a T-junction with buildable stubs on both branches. */
  private tryJunction(after: TileInfo, cell: Cell, entry: Vec2): boolean {
    if (!this.canPlace(cell, after.cell)) return false
    const leftDir = rotateLeft(entry)
    const rightDir = rotateRight(entry)
    const leftCells = this.branchCells(cell, leftDir)
    const rightCells = this.branchCells(cell, rightDir)
    if (!leftCells || !rightCells) return false
    // Ensure the two branches don't collide with each other.
    for (const c of leftCells) if (rightCells.some((r) => r.gx === c.gx && r.gz === c.gz)) return false

    const junction = this.makeTile('T_JUNCTION', cell, entry, entry, [leftDir, rightDir])
    junction.exitDirL = leftDir
    junction.exitDirR = rightDir
    junction.requiresTurn = true
    junction.correct = Math.random() < 0.5 ? 'L' : 'R'
    this.pushTile(junction, after)

    const left = this.growStub(junction, leftDir, leftCells)
    const right = this.growStub(junction, rightDir, rightCells)
    this.pending = { junction, left, right }
    this.straightsSinceJunction = 0
    if (this.junctionListener) this.junctionListener(this.committed)
    return true
  }

  /** Plan free cells for a branch of `JUNCTION_STUB` straight tiles. */
  private branchCells(from: Cell, dir: Vec2): Cell[] | null {
    const cells: Cell[] = []
    let prev = from
    let c = from
    for (let i = 0; i < JUNCTION_STUB; i++) {
      c = step(c, dir)
      if (!this.canPlace(c, prev) || cells.some((p) => p.gx === c.gx && p.gz === c.gz)) return null
      cells.push(c)
      prev = c
    }
    return cells
  }

  private growStub(junction: TileInfo, dir: Vec2, cells: Cell[]): TileInfo[] {
    const out: TileInfo[] = []
    let prev = junction
    for (const c of cells) {
      const t = this.makeTile('STRAIGHT', c, dir, dir)
      prev.next = t
      prev = t
      out.push(t)
    }
    return out
  }

  /** Pick a turn side whose onward cell (after turning) is free, to avoid
   *  immediately dead-ending. `cell` is where the turn tile itself sits. */
  private pickTurnSide(cell: Cell, entry: Vec2): Side | null {
    const options: Side[] = []
    for (const side of ['L', 'R'] as Side[]) {
      const onward = step(cell, turn(entry, side))
      if (this.canPlace(onward, cell)) options.push(side)
    }
    if (options.length === 0) return null
    return options[randInt(0, options.length - 1)]
  }

  // --- helpers -------------------------------------------------------------

  private isFree(c: Cell): boolean {
    return !this.occupied.has(cellKey(c))
  }

  /** A cell is placeable if it's free AND not orthogonally adjacent to any road
   *  other than the tile we're connecting from. This keeps streets from running
   *  parallel right next to each other — which made their building rows overlap
   *  and look like you were running through walls after a turn. */
  private canPlace(cell: Cell, from: Cell): boolean {
    if (!this.isFree(cell)) return false
    const nbrs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ]
    for (const d of nbrs) {
      const n = step(cell, d)
      if (n.gx === from.gx && n.gz === from.gz) continue
      if (this.occupied.has(cellKey(n))) return false
    }
    return true
  }

  private makeTile(
    type: TileType,
    cell: Cell,
    entryDir: Vec2,
    exitDir: Vec2,
    exits: Vec2[] = [exitDir],
  ): TileInfo {
    const group = buildTileMesh(type, entryDir, exits)
    group.position.copy(cellCenter(cell))
    this.scene.add(group)
    this.occupied.add(cellKey(cell))
    const info: TileInfo = {
      type,
      cell,
      entryDir,
      exitDir,
      requiresTurn: type === 'TURN_L' || type === 'TURN_R' || type === 'T_JUNCTION',
      group,
      obstacles: [],
      pickups: [],
    }
    if ((type === 'STRAIGHT' || type === 'MARKET_ENTRY' || type === 'BRIDGE') && this.decorator)
      this.decorator(info)
    return info
  }

  private pushTile(info: TileInfo, after: TileInfo): void {
    after.next = info
    this.committed.push(info)
  }

  private disposeStubs(stubs: TileInfo[]): void {
    for (const t of stubs) {
      this.scene.remove(t.group)
      disposeTile(t)
      this.occupied.delete(cellKey(t.cell))
    }
  }

  private recycle(currentIndex: number): number {
    let removed = 0
    while (currentIndex - removed > CONFIG.TILES_BEHIND) {
      const t = this.committed[removed]
      this.scene.remove(t.group)
      disposeTile(t)
      this.occupied.delete(cellKey(t.cell))
      removed++
    }
    if (removed > 0) this.committed.splice(0, removed)
    return removed
  }
}

const DIR_N: Vec2 = { x: 0, z: -1 }
