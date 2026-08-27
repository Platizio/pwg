const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface CaptchaOutcome {
  ok: boolean
  verified: boolean
  message?: string
}

export async function verifyTurnstile(token: string | null, ip: string | null): Promise<CaptchaOutcome> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')

  if (!secret) {
    console.warn(
      'TURNSTILE_SECRET_KEY is not set — accepting the request without a captcha check.',
    )
    return { ok: true, verified: false }
  }

  if (!token) {
    return { ok: false, verified: false, message: 'Please complete the verification challenge and try again.' }
  }

  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form })
    const data = await res.json() as { success?: boolean; 'error-codes'?: string[] }

    if (data.success) return { ok: true, verified: true }

    console.warn('Turnstile rejected a token', data['error-codes'])
    return {
      ok: false,
      verified: false,
      message: 'That verification could not be confirmed. Please try again.',
    }
  } catch (error) {
    console.error('Turnstile verification could not be reached', error)
    return {
      ok: false,
      verified: false,
      message: 'We could not complete the verification check. Please try again in a moment.',
    }
  }
}
