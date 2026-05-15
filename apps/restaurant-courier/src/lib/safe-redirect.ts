/**
 * Validates a caller-supplied redirect target and returns a safe path.
 *
 * Rules:
 *  - Must start with a single `/` (relative path on the same origin).
 *  - Must NOT start with `//` (protocol-relative URL — browser treats it as
 *    an absolute URL to an attacker's host).
 *  - Must NOT start with `\` or contain `\` before any `/` (backslash bypass
 *    on some parsers: `\evil.com` is treated as `//evil.com` by Chrome).
 *  - Must NOT contain a `:` in the portion before the first `/` (catches
 *    `javascript:`, `data:`, `vbscript:`, and scheme-relative variants).
 *  - Percent-encoded variants are normalised by decoding once before
 *    applying the checks, defeating `%2F%2Fevil.com` bypasses.
 *
 * Returns the safe path on success, or the fallback (default `/dashboard`)
 * when the input fails any check.
 */
export function safeRedirectPath(
  input: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!input) return fallback;

  // Decode once to catch percent-encoded bypass attempts like %2F%2F.
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    // Malformed percent-encoding — reject.
    return fallback;
  }

  // Strip leading whitespace that some parsers skip over.
  const trimmed = decoded.trimStart();

  // Must start with exactly one `/`.
  if (!trimmed.startsWith('/')) return fallback;

  // Reject `//` (protocol-relative) and `\` (backslash bypass).
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;

  // Reject anything with a `:` before the first real path segment — catches
  // `javascript:alert(1)` surviving a leading-slash prefix trick and similar.
  const firstSegment = trimmed.slice(1).split('/')[0];
  if (firstSegment.includes(':')) return fallback;

  return trimmed;
}
