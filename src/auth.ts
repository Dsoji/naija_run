import { Clerk } from '@clerk/clerk-js'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

if (!publishableKey) {
  throw new Error(
    'Missing VITE_CLERK_PUBLISHABLE_KEY. Add your key to .env.local.\n' +
      'Run: 1) clerk auth login  2) clerk env pull  — then restart the dev server.',
  )
}

export const clerk = new Clerk(publishableKey)

let loaded = false

/** Load the Clerk client once. Safe to await repeatedly. */
export async function initAuth(): Promise<Clerk> {
  if (!loaded) {
    await clerk.load()
    loaded = true
  }
  return clerk
}

/** A stable, per-user key for localStorage (falls back to a guest namespace). */
export function userScopeKey(base: string): string {
  const id = clerk.user?.id ?? 'guest'
  return `${base}:${id}`
}

/** Best-effort, human-readable error message from a Clerk/unknown error. */
export function clerkErrorMessage(err: unknown): string {
  const anyErr = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  return (
    anyErr?.errors?.[0]?.longMessage ??
    anyErr?.errors?.[0]?.message ??
    anyErr?.message ??
    'Something went wrong. Please try again.'
  )
}
