// RSHIR-37: safe stringify for `<script type="application/ld+json">` blocks.
// `JSON.stringify` does NOT escape `<`, so a tenant-controlled string like
// `</script><script>...` lands stored XSS in the customer's browser. Escape
// the characters that can break out of a script tag (and U+2028 / U+2029
// because some older JS parsers treat them as line terminators inside JSON).
//
// The regex is built via the RegExp constructor so the source TypeScript
// file does not contain literal U+2028 / U+2029 (which TS treats as line
// terminators and refuses inside regex literals).

const SCRIPT_BREAK_RE = new RegExp('[<>&\\u2028\\u2029]', 'g');

export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(SCRIPT_BREAK_RE, (c) => {
    switch (c) {
      case '<': return '\\u003c';
      case '>': return '\\u003e';
      case '&': return '\\u0026';
      case ' ': return '\\u2028';
      case ' ': return '\\u2029';
      default: return c;
    }
  });
}
