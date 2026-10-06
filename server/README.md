# Naija Run — Leaderboard API (placeholder)

Built in **Phase 6.5**. Not implemented yet.

Planned: a small Node + TypeScript service (Fastify/Express) + Postgres.

- `POST /scores` — submit a finished run. Auth via Clerk session JWT (verified
  server-side with JWKS); the `userId` comes from the verified token, never the
  body. The server recomputes the composite score (mirror of
  `src/config.ts#computeScore`) and stores raw stats + score.
- `GET /scores/top?limit=20` — top runs by composite score.

Local dev will use a `docker-compose` Postgres. Hosting (Render or Helicarrier)
is chosen at Phase 7. See `../NOTES.md` for the full rationale.
