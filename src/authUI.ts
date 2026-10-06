import { clerk, clerkErrorMessage } from './auth'

type Mode = 'sign-in' | 'sign-up'

/** The loaded Clerk client. Safe once initAuth() has resolved (before any modal opens). */
function client() {
  if (!clerk.client) throw new Error('Clerk client is not loaded yet.')
  return clerk.client
}

/**
 * Render the account controls into `el`:
 *  - signed out → "Sign in" / "Sign up" buttons that open the custom modal
 *  - signed in  → Clerk UserButton
 * Re-renders automatically on auth state changes.
 */
export function mountAuthControls(el: HTMLElement): void {
  const render = () => {
    el.innerHTML = ''
    if (clerk.user) {
      const name = clerk.user.username ?? clerk.user.firstName ?? 'Account'
      const label = document.createElement('span')
      label.className = 'auth-user'
      label.textContent = `@${name}`
      const out = button('Sign out', 'auth-btn auth-btn--ghost', () => {
        void clerk.signOut()
      })
      el.append(label, out)
      return
    }

    const signIn = button('Sign in', 'auth-btn auth-btn--ghost', () => openAuthModal('sign-in'))
    const signUp = button('Sign up', 'auth-btn', () => openAuthModal('sign-up'))
    el.append(signIn, signUp)
  }

  render()
  // Guard so a render error can never abort setActive() / other listeners.
  clerk.addListener(() => {
    try {
      render()
    } catch (e) {
      console.error('auth control render failed', e)
    }
  })
}

/** Open the custom auth modal in the given mode. */
export function openAuthModal(mode: Mode): void {
  document.getElementById('auth-modal')?.remove()

  const overlay = document.createElement('div')
  overlay.id = 'auth-modal'
  overlay.className = 'auth-overlay'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })

  const card = document.createElement('div')
  card.className = 'auth-card'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  overlay.appendChild(card)

  document.body.appendChild(overlay)
  renderMode(card, mode)
}

function renderMode(card: HTMLElement, mode: Mode): void {
  if (mode === 'sign-in') renderSignIn(card)
  else renderSignUp(card)
}

// --- Sign up: collect username, first/last name, email, password -------------
function renderSignUp(card: HTMLElement): void {
  card.innerHTML = `
    <button type="button" class="auth-close" aria-label="Close">&times;</button>
    <h2 class="auth-title">Create your account</h2>
    <form class="auth-form" novalidate>
      <div class="auth-row">
        <label>First name<input name="firstName" autocomplete="given-name" required /></label>
        <label>Last name<input name="lastName" autocomplete="family-name" required /></label>
      </div>
      <label>Username<input name="username" autocomplete="username" minlength="4" required /></label>
      <label>Email<input name="email" type="email" autocomplete="email" required /></label>
      <label>Password<input name="password" type="password" autocomplete="new-password" required /></label>
      <div id="clerk-captcha"></div>
      <p class="auth-error" hidden></p>
      <button type="submit" class="auth-btn auth-submit">Continue</button>
    </form>
    <p class="auth-switch">Already have an account? <a href="#">Sign in</a></p>
  `
  wireCommon(card, 'sign-in')

  const form = card.querySelector('form') as HTMLFormElement
  const err = card.querySelector('.auth-error') as HTMLElement
  const submit = card.querySelector('.auth-submit') as HTMLButtonElement

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError(err)
    const data = new FormData(form)
    setBusy(submit, true, 'Creating…')
    try {
      await client().signUp.create({
        firstName: String(data.get('firstName') ?? '').trim(),
        lastName: String(data.get('lastName') ?? '').trim(),
        username: String(data.get('username') ?? '').trim(),
        emailAddress: String(data.get('email') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      })
      await client().signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      renderVerify(card)
    } catch (ex) {
      showError(err, clerkErrorMessage(ex))
      setBusy(submit, false, 'Continue')
    }
  })
}

// --- Sign up step 2: email verification code ---------------------------------
function renderVerify(card: HTMLElement): void {
  card.innerHTML = `
    <button type="button" class="auth-close" aria-label="Close">&times;</button>
    <h2 class="auth-title">Verify your email</h2>
    <p class="auth-sub">Enter the 6-digit code we sent to your email.</p>
    <form class="auth-form" novalidate>
      <label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" required /></label>
      <p class="auth-error" hidden></p>
      <button type="submit" class="auth-btn auth-submit">Verify &amp; continue</button>
    </form>
    <p class="auth-switch"><a href="#" class="auth-resend">Resend code</a></p>
  `
  wireClose(card)

  const form = card.querySelector('form') as HTMLFormElement
  const err = card.querySelector('.auth-error') as HTMLElement
  const submit = card.querySelector('.auth-submit') as HTMLButtonElement

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError(err)
    const code = String(new FormData(form).get('code') ?? '').trim()
    setBusy(submit, true, 'Verifying…')
    try {
      const res = await client().signUp.attemptEmailAddressVerification({ code })
      if (res.status === 'complete' && res.createdSessionId) {
        await clerk.setActive({ session: res.createdSessionId })
        document.getElementById('auth-modal')?.remove()
      } else {
        showError(err, 'Could not complete sign-up. Please check the code and try again.')
        setBusy(submit, false, 'Verify & continue')
      }
    } catch (ex) {
      showError(err, clerkErrorMessage(ex))
      setBusy(submit, false, 'Verify & continue')
    }
  })

  card.querySelector('.auth-resend')?.addEventListener('click', async (e) => {
    e.preventDefault()
    hideError(err)
    try {
      await client().signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
    } catch (ex) {
      showError(err, clerkErrorMessage(ex))
    }
  })
}

// --- Sign in: email or username + password -----------------------------------
function renderSignIn(card: HTMLElement): void {
  card.innerHTML = `
    <button type="button" class="auth-close" aria-label="Close">&times;</button>
    <h2 class="auth-title">Welcome back</h2>
    <form class="auth-form" novalidate>
      <label>Email or username<input name="identifier" autocomplete="username" required /></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
      <p class="auth-error" hidden></p>
      <button type="submit" class="auth-btn auth-submit">Sign in</button>
    </form>
    <p class="auth-switch">No account yet? <a href="#">Sign up</a></p>
  `
  wireCommon(card, 'sign-up')

  const form = card.querySelector('form') as HTMLFormElement
  const err = card.querySelector('.auth-error') as HTMLElement
  const submit = card.querySelector('.auth-submit') as HTMLButtonElement

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError(err)
    const data = new FormData(form)
    setBusy(submit, true, 'Signing in…')
    try {
      const res = await client().signIn.create({
        identifier: String(data.get('identifier') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      })
      if (res.status === 'complete' && res.createdSessionId) {
        await clerk.setActive({ session: res.createdSessionId })
        document.getElementById('auth-modal')?.remove()
      } else {
        showError(err, 'Additional verification is required to finish signing in.')
        setBusy(submit, false, 'Sign in')
      }
    } catch (ex) {
      showError(err, clerkErrorMessage(ex))
      setBusy(submit, false, 'Sign in')
    }
  })
}

// --- Small DOM helpers -------------------------------------------------------
function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

function wireClose(card: HTMLElement): void {
  card.querySelector('.auth-close')?.addEventListener('click', () =>
    document.getElementById('auth-modal')?.remove(),
  )
}

/** Wire the close button and the "switch mode" link. */
function wireCommon(card: HTMLElement, switchTo: Mode): void {
  wireClose(card)
  card.querySelector('.auth-switch a')?.addEventListener('click', (e) => {
    e.preventDefault()
    renderMode(card, switchTo)
  })
}

function setBusy(btn: HTMLButtonElement, busy: boolean, label: string): void {
  btn.disabled = busy
  btn.textContent = label
}

function showError(el: HTMLElement, msg: string): void {
  el.textContent = msg
  el.hidden = false
}

function hideError(el: HTMLElement): void {
  el.hidden = true
  el.textContent = ''
}
