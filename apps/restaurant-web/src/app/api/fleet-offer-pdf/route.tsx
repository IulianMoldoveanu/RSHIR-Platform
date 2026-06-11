import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 2026-06-11 — react-pdf renderToBuffer fails on Next 15 with reconciler
// error #31. Pivoted to a printable HTML page at /oferta-flota (browser
// Ctrl/Cmd+P -> Save as PDF is the most reliable cross-platform fallback).
// This route now 302s to the HTML page so any existing share links keep working.

export function GET(req: NextRequest) {
  const fleet = req.nextUrl.searchParams.get('fleet') ?? '';
  const target = new URL('/oferta-flota', req.nextUrl.origin);
  if (fleet) target.searchParams.set('fleet', fleet);
  return NextResponse.redirect(target.toString(), 302);
}
