// Vitest alias target for `server-only`. The real package only exists to
// throw at import time when bundled into a client component; under vitest
// we want it to be a no-op.
export {};
