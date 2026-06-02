import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politica de confidențialitate — HIR Curier',
  description:
    'Cum colectăm și procesăm datele tale personale în aplicația HIR Curier.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[#0F1115] px-5 py-8 text-[#E4E4F0]">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/settings"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#9090AA] hover:text-[#E4E4F0]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Înapoi
        </Link>

        <header className="mb-8 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30">
            <Shield className="h-5 w-5 text-violet-300" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Politica de confidențialitate</h1>
            <p className="mt-1 text-sm text-[#9090AA]">
              HIR Curier — aplicație pentru curierii platformei HIR for Restaurants
            </p>
          </div>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-sm leading-relaxed text-[#BBBBD0]">

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">1. Operator de date</h2>
            <p>
              Operatorul de date cu caracter personal este HIR Technology SRL (denumit în continuare
              &quot;HIR&quot;), cu sediul în România. Contactul desemnat pentru protecția datelor:{' '}
              <a href="mailto:gdpr@hirforyou.ro" className="text-violet-400 hover:underline">
                gdpr@hirforyou.ro
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">2. Date colectate</h2>
            <p>
              Aplicația HIR Curier colectează următoarele categorii de date:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong className="text-[#E4E4F0]">Date de localizare (GPS)</strong> — latitudine,
                longitudine, precizie, viteză și direcție. Colectate în timp real pe durata
                unei ture active, <strong className="text-[#E4E4F0]">inclusiv în fundal</strong>{' '}
                (când telefonul e blocat sau aplicația nu e în prim-plan), printr-un serviciu cu
                notificare permanentă. Urmărirea se oprește automat când închizi tura. Utilizate
                pentru: rutare comenzi, calcul ETA, afișare pe harta clientului, dovadă de livrare
                în zona geofence.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Fotografii (dovadă de livrare)</strong> — imagini
                realizate cu camera dispozitivului la predarea coletului. Stocate în
                Supabase Storage bucket &quot;delivery-proofs&quot;, accesibil doar echipei HIR și
                partenerilor de restaurant relevanți. Retenție: 30 de zile.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Token dispozitiv push (FCM/APNs)</strong> —
                identificator anonim generat de Google Firebase (Android) sau Apple APNs
                (iOS). Utilizat exclusiv pentru trimiterea notificărilor privind comenzile
                noi și alertele operaționale.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Date de profil</strong> — nume, email, telefon,
                tip vehicul, statut curier. Furnizate la înregistrare.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Date de activitate</strong> — jurnal ture, comenzi
                acceptate / livrate / anulate, câștiguri, performanță. Necesare pentru
                plata comisioanelor și raportare.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">3. Temei legal</h2>
            <p>
              Prelucrarea datelor se bazează pe:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong className="text-[#E4E4F0]">Executarea contractului</strong> (Art. 6(1)(b) GDPR)
                — localizare GPS, fotografii livrare, date de activitate necesare pentru
                furnizarea serviciului de curierat.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Consimțământ</strong> (Art. 6(1)(a) GDPR) —
                notificări push, acces la cameră. Poți retrage consimțământul oricând din
                setările dispozitivului sau ale aplicației.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Interes legitim</strong> (Art. 6(1)(f) GDPR) —
                prevenirea fraudei, securitatea platformei, îmbunătățirea serviciului.
              </li>
            </ul>
            <p className="mt-2">
              <strong className="text-[#E4E4F0]">Localizarea în fundal</strong> este limitată la
              strictul necesar (minimizarea datelor, Art. 5(1)(c) GDPR): se colectează exclusiv cât
              tura este pornită, se oprește automat la închiderea turei, iar cât este activă vezi o
              notificare permanentă. Poți revoca permisiunea oricând din setările telefonului.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">4. Destinatari</h2>
            <p>
              Datele tale pot fi accesate de:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Echipa HIR Technology SRL (intern, acces restricționat).</li>
              <li>
                Parteneri restaurant — localizare GPS (doar în timpul livrării active) și
                confirmarea livrării.
              </li>
              <li>Supabase Inc. (SUA) — infrastructură cloud, date stocate în UE (eu-central-1).</li>
              <li>Google LLC — Firebase Cloud Messaging (notificări Android).</li>
              <li>Apple Inc. — APNs (notificări iOS).</li>
              <li>Sentry Inc. — raportare erori anonimizate.</li>
            </ul>
            <p className="mt-2">
              Nu vindem datele tale terților. Transferurile internaționale (Supabase US, Google,
              Apple) sunt acoperite de Clauze Contractuale Standard aprobate de Comisia Europeană.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">5. Retenție</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Date GPS: doar ultima poziție pe durata turei (suprascrisă în timp real); fără istoric GPS de lungă durată.</li>
              <li>Fotografii livrare: 30 de zile.</li>
              <li>Date activitate / câștiguri: 5 ani (obligații fiscale).</li>
              <li>Token push: până la dezinstalarea aplicației sau revocarea permisiunii.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">6. Drepturile tale (GDPR)</h2>
            <p>Ai dreptul la: acces, rectificare, ștergere, restricționare, portabilitate și opoziție.</p>
            <p className="mt-2">
              Pentru a-ți exercita drepturile sau pentru a șterge contul, accesează{' '}
              <Link href="/settings/delete-account" className="text-violet-400 hover:underline">
                Setări → Șterge cont
              </Link>{' '}
              sau contactează-ne la{' '}
              <a href="mailto:gdpr@hirforyou.ro" className="text-violet-400 hover:underline">
                gdpr@hirforyou.ro
              </a>
              . Răspundem în maxim 30 de zile.
            </p>
            <p className="mt-2">
              Ai dreptul să depui plângere la Autoritatea Națională de Supraveghere a Prelucrării
              Datelor cu Caracter Personal (ANSPDCP):{' '}
              <a
                href="https://www.dataprotection.ro"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:underline"
              >
                dataprotection.ro
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">7. Permisiuni aplicație</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong className="text-[#E4E4F0]">Localizare precisă (foreground)</strong> — necesar
                pe durata turei active.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Localizare în fundal (background)</strong> — necesar
                pe Android pentru tracking continuu când aplicația nu este în prim-plan.
                Poți revoca din Setări → Aplicații → HIR Curier → Permisiuni.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Cameră</strong> — necesar pentru dovada de livrare.
              </li>
              <li>
                <strong className="text-[#E4E4F0]">Notificări push</strong> — pentru alerte comenzi noi
                și mesaje operaționale.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">8. Modificări</h2>
            <p>
              Această politică poate fi actualizată. Versiunea actuală este publicată la{' '}
              <code className="rounded bg-[#1C1C2E] px-1 py-0.5 text-xs">
                https://courier.hirforyou.ro/privacy
              </code>
              . Modificările semnificative vor fi comunicate prin notificare în aplicație.
            </p>
          </section>

          <p className="mt-8 text-xs text-[#666680]">
            Ultima actualizare: iunie 2026 &middot; Versiune 1.1
          </p>
        </div>
      </div>
    </div>
  );
}
