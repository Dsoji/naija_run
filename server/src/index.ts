// Naija Run leaderboard API (project addition — overrides spec §14).
//
//   GET  /scores/top?limit=20  → public; top runs by composite score
//   POST /scores               → Clerk-authenticated; records a finished run
//
// The user id comes from the verified Clerk session token (never the body), and
// the composite score is recomputed server-side (see score.ts), so the ranked
// number can't be forged even though raw stats are client-reported. Light sanity
// caps reject impossible stats; full validation is out of scope for a prototype.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { computeScore } from './score.js'

const PORT = Number(process.env.PORT ?? 8787)
const DATABASE_URL = requireEnv('DATABASE_URL')
const CLERK_SECRET_KEY = requireEnv('CLERK_SECRET_KEY')
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

const pool = new Pool({ connectionString: DATABASE_URL })
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })

async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         bigserial PRIMARY KEY,
      user_id    text NOT NULL,
      name       text NOT NULL,
      score      integer NOT NULL,
      distance   real NOT NULL,
      money      integer NOT NULL,
      caught     boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC)`)
}

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/scores/top', async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15))
  try {
    const { rows } = await pool.query(
      `SELECT name, score, distance, money, caught
         FROM scores ORDER BY score DESC, created_at ASC LIMIT $1`,
      [limit],
    )
    res.json(rows)
  } catch (e) {
    console.error('top failed', e)
    res.status(500).json({ error: 'server error' })
  }
})

app.post('/scores', async (req, res) => {
  const auth = req.header('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'missing token' })
    return
  }

  let userId: string
  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY })
    userId = claims.sub
  } catch {
    res.status(401).json({ error: 'invalid token' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const distance = Number(body.distanceMeters)
  const money = Number(body.money)
  const time = Number(body.timeSeconds)
  const caught = Boolean(body.caught)
  if (!inRange(distance, 0, 1_000_000) || !inRange(money, 0, 10_000_000) || !inRange(time, 0, 36_000)) {
    res.status(400).json({ error: 'bad stats' })
    return
  }
  if (caught && distance <= 0) {
    res.status(400).json({ error: 'bad stats' })
    return
  }

  const score = computeScore({ distanceMeters: distance, money, timeSeconds: time, caught })

  // Display name always comes from Clerk, never the client.
  let name = 'runner'
  try {
    const u = await clerk.users.getUser(userId)
    name = u.username || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'runner'
  } catch {
    /* keep default */
  }

  try {
    await pool.query(
      `INSERT INTO scores (user_id, name, score, distance, money, caught)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, name.slice(0, 40), score, distance, Math.round(money), caught],
    )
    res.json({ ok: true, score })
  } catch (e) {
    console.error('insert failed', e)
    res.status(500).json({ error: 'server error' })
  }
})

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max
}
function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) {
    console.error(`Missing required env ${key}. See server/.env.example`)
    process.exit(1)
  }
  return v
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`Naija Run leaderboard API on :${PORT}`)))
  .catch((e) => {
    console.error('startup failed', e)
    process.exit(1)
  })
