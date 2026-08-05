import { getLocale } from '@/lib/i18n/server';
import { DemoTracking } from '../_components/demo-tracking';

// Server shell: the tracking simulation is a client component (timers, the
// persisted fulfilment choice, a Leaflet map), but the locale has to come from
// the cookie on the server like everywhere else on the site.
export default async function DemoConfirmationPage() {
  const locale = await getLocale();
  return <DemoTracking locale={locale} />;
}
