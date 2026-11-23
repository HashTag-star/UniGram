/**
 * Turns any thrown value (Supabase/Postgres errors, fetch failures, edge-function
 * errors, our own Errors) into a short sentence a student can act on.
 * Raw technical text is never shown; it is logged for debugging instead.
 */
const DEFAULT_MSG = 'Something went wrong. Please try again.';

const RULES: Array<[RegExp, string]> = [
  // Connectivity
  [/network request failed|failed to fetch|networkerror|timed? ?out|timeout|etimedout|enotfound|econnreset|econnrefused|offline|no internet|load failed/i,
    "Can't reach UniGram right now. Check your connection and try again."],
  // Auth
  [/invalid login credentials/i, 'Incorrect email or password.'],
  [/email not confirmed/i, 'Please verify your email before signing in.'],
  [/already registered|already been registered|user already exists/i, 'An account with this email already exists. Try signing in instead.'],
  [/password.*(at least|should be|too short|weak)|weak password/i, 'Choose a stronger password (at least 8 characters).'],
  [/jwt expired|invalid jwt|not authenticated|unauthori[sz]ed|auth session missing|invalid refresh token|refresh_token/i, 'Your session expired. Please sign in again.'],
  [/rate limit|too many requests|over_request_rate_limit|\b429\b|for security purposes/i, 'Too many attempts. Please wait a moment and try again.'],
  // Permissions / data
  [/row-level security|permission denied|not allowed|forbidden|\b403\b|not your /i, "You don't have permission to do that."],
  [/duplicate key|already exists|unique constraint/i, 'That already exists.'],
  [/violates (foreign key|not-null|check) constraint|invalid input (syntax|value)|null value in column/i, "Something in that isn't valid. Please check it and try again."],
  [/schema cache|does not exist|could not find the (function|table)|pgrst\d+|relation .* not found/i, 'This feature is being updated. Please try again in a moment.'],
  [/payload too large|\b413\b|file.*too large|exceeds the maximum/i, 'That file is too large. Try a smaller one.'],
  [/\b5\d\d\b|internal (server )?error|bad gateway|service unavailable|edge function returned a non-2xx/i, 'Our servers are having a moment. Please try again shortly.'],
  // Ads / payments (server messages from migrations 062-064)
  [/fully paid before it can run/i, 'Finish payment to launch this campaign.'],
  [/campaign has expired/i, 'This campaign has expired.'],
  [/payment.*(not completed|cancel|abandon)/i, 'Payment was not completed. You have not been charged.'],
  [/paid amount does not match/i, "We couldn't confirm the full payment amount. Please contact support if you were charged."],
  [/simulated payments are disabled/i, 'Payments are not available yet.'],
];

/** True when text reads like a technical message rather than a sentence for people. */
function looksTechnical(msg: string): boolean {
  return (
    msg.length > 140 ||
    /[{}\[\]<>]|\bat\s+\S+:\d+|stack|undefined|null\b|\bTypeError\b|\bReferenceError\b|\bSyntaxError\b|\bPostgrest|\bPGRST|\bSQLSTATE|\bECONN|\bAxios|\bfetch\b|0x[0-9a-f]+/i.test(msg) ||
    /^[a-z_]+(\.[a-z_]+)+/.test(msg) // e.g. "auth.invalid_grant"
  );
}

function extractMessage(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const any = e as any;
  return String(any.message ?? any.error_description ?? any.error ?? any.details ?? '');
}

export function friendlyError(e: unknown, fallback: string = DEFAULT_MSG): string {
  const raw = extractMessage(e).trim();
  if (!raw) return fallback;
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  if (looksTechnical(raw)) {
    try { console.warn('[friendlyError] hid technical message:', raw); } catch {}
    return fallback;
  }
  // Short, human-written sentence (e.g. our own RAISE EXCEPTION texts) — keep as is.
  return raw;
}
