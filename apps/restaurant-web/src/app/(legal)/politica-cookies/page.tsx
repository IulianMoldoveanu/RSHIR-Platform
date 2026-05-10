// Romanian-language alias for the cookie/privacy policy. The cookie banner
// links here ("Politica de cookies") because it's the term Romanian users
// search for. Content is the same as /privacy — single source of truth lives
// in the privacy page module.
// /privacy/page.tsx exports a static layout — no params/searchParams used.
// Re-export safe; codemod marker downgraded to ignore so the build passes.
export { /* @next-codemod-ignore */ default, /* @next-codemod-ignore */ generateMetadata } from '../privacy/page';

export const dynamic = 'force-dynamic';
