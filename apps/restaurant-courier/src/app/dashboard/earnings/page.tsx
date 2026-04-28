import { Card, CardContent, CardHeader, CardTitle } from '@hir/ui';

export const dynamic = 'force-dynamic';

export default function EarningsPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Câștiguri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          <p>
            Calculul câștigurilor va fi disponibil în următorul update — după ce
            adăugăm tarifele și rapoartele săptămânale.
          </p>
          <ul className="ml-4 list-disc text-zinc-500">
            <li>Tarif fix per livrare</li>
            <li>Bonus zone &amp; orar</li>
            <li>Plată săptămânală sau la cerere</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
