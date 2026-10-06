// Leaderboard client (project addition — overrides spec §14). Submits a
// finished run's stats (with the Clerk session token) and fetches the top runs.
// Degrades gracefully when CONFIG.API_BASE is empty or the network fails — the
// game stays fully playable offline. Implemented in Phase 6.5.
export class Leaderboard {}
