// Circular in-memory buffer for the last N console.error / console.warn lines.
// Used by the feedback FAB to attach the most recent client-side errors to a
// vendor's bug report. Sanitization lives server-side in the Edge Function —
// this module only captures and serializes.
//
// Singleton: the wrapper installs itself once on first import in the browser.
// SSR is a no-op (typeof window === 'undefined').

const MAX_LINES = 50;
const buffer: string[] = [];
let installed = false;

function fmt(level: 'error' | 'warn', args: unknown[]): string {
  const ts = new Date().toISOString();
  const parts = args.map((a) => {
    if (a instanceof Error) {
      return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
    }
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  });
  return `[${ts}] ${level.toUpperCase()} ${parts.join(' ')}`;
}

function push(line: string) {
  buffer.push(line);
  if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
}

export function installConsoleBuffer(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    try {
      push(fmt('error', args));
    } catch {
      // buffer write must never throw
    }
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    try {
      push(fmt('warn', args));
    } catch {
      // buffer write must never throw
    }
    origWarn(...args);
  };

  // Also capture unhandled errors + promise rejections.
  window.addEventListener('error', (e) => {
    try {
      push(fmt('error', [`window.error: ${e.message}`, e.filename, `${e.lineno}:${e.colno}`]));
    } catch {
      // ignore
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
      push(fmt('error', ['unhandledrejection:', reason]));
    } catch {
      // ignore
    }
  });
}

export function getConsoleExcerpt(): string {
  return buffer.join('\n');
}
