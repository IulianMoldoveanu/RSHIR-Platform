// /reseller/resources — DEPRECATED 2026-05-08.
//
// Redirects to /partner-portal (canonical surface). Marketing assets gallery
// will be re-mounted under /partner-portal/resources in a follow-up polish PR.

import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DeprecatedResellerResources(): never {
  permanentRedirect('/partner-portal');
}
