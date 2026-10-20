/** Must match the preview bearer key in src/lib/auth/client.ts. */
const BEARER_KEY = "grok-auth.bearer-token";

/** Keep an email/password session alive inside the embedded preview. */
export function rememberSessionToken(token: string | null | undefined) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.sessionStorage.setItem(BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}
