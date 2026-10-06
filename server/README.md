# Naija Run — Leaderboard API

Small Node + TypeScript (Express) service backing the in-game leaderboard.
Clerk-authenticated writes, public reads, composite score computed server-side.

## Endpoints

- `GET /scores/top?limit=20` — public. Top runs by composite score.
- `POST /scores` — requires `Authorization: Bearer <clerk session token>`.
  Body: `{ distanceMeters, money, timeSeconds, caught }`. The user id comes from
  the verified token (never the body); the server recomputes the score
  (`src/score.ts`, a mirror of the game's `config.ts#computeScore`) and stores
  the run. Light sanity caps reject impossible stats.
- `GET /health` — liveness.

## Run locally

```bash
# 1) Postgres (from the project root, naija-run/)
docker compose up -d

# 2) API
cd server
cp .env.example .env         # fill CLERK_SECRET_KEY with your Clerk secret
npm install
npm run dev                  # http://localhost:8787
```

Then point the game at it: add to `naija-run/.env.local`

```
VITE_API_BASE=http://localhost:8787
```

and restart `npm run dev` in the game. With `VITE_API_BASE` unset the game runs
normally and just hides the leaderboard.

## Notes

- `src/score.ts` MUST stay in sync with the game's `computeScore`.
- The game is client-authoritative, so raw stats are spoofable; this is accepted
  for a prototype. The server recomputes the ranked score and caps absurd values.
- Hosting (Render or Helicarrier) is chosen at deploy time (Phase 7.3); nothing
  in the code changes but env vars + `CORS_ORIGIN`.
