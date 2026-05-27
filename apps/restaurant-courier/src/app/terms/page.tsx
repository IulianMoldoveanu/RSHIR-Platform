import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Termeni și condiții — HIR Curier',
  description: 'Termenii și condițiile de utilizare a aplicației HIR Curier.',
};

export default function TermsPage() {
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
            <FileText className="h-5 w-5 text-violet-300" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Termeni și condiții</h1>
            <p className="mt-1 text-sm text-[#9090AA]">
              HIR Curier — condiții de utilizare a aplicației
            </p>
          </div>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-sm leading-relaxed text-[#BBBBD0]">

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">1. Acceptare</h2>
            <p>
              Prin utilizarea aplicației HIR Curier (&quot;Aplicația&quot;), accepți integral acești
              Termeni și Condiții (&quot;T&amp;C&quot;). Dacă nu ești de acord, nu utiliza Aplicația.
              Aplicația este operată de HIR Technology SRL (&quot;HIR&quot;), România.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">2. Eligibilitate</h2>
            <p>
              Aplicația este destinată exclusiv curierilor înregistrați și aprobați de HIR.
              Trebuie să ai minimum 18 ani, un vehicul adecvat și un contract valabil cu HIR.
              Utilizarea neautorizată este interzisă.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">3. Contul tău</h2>
            <p>
              Ești responsabil pentru securitatea credențialelor de autentificare. Nu partaja contul.
              Activitatea din cont este responsabilitatea ta. Notifică-ne imediat la{' '}
              <a href="mailto:suport@hirforyou.ro" className="text-violet-400 hover:underline">
                suport@hirforyou.ro
              </a>{' '}
              dacă suspectezi acces neautorizat.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">4. Utilizare permisă</h2>
            <p>Aplicația poate fi utilizată exclusiv pentru:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Acceptarea și gestionarea comenzilor de livrare atribuite de HIR.</li>
              <li>Comunicarea cu restaurantele partenere și cu clienții.</li>
              <li>Urmărirea câștigurilor și a istoricului de livrări.</li>
              <li>Actualizarea profilului și a datelor vehiculului.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">5. Obligațiile curierului</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Să accepte comenzile în timp util și să le finalizeze cu profesionalism.</li>
              <li>
                Să permită accesul GPS al aplicației pe durata turelor active (necesar pentru
                atribuirea comenzilor și calculul ETA).
              </li>
              <li>
                Să realizeze fotografii dovadă de livrare conform procedurii HIR (o fotografie
                clară a coletului la adresa de livrare).
              </li>
              <li>Să respecte legislația rutieră și normele de siguranță.</li>
              <li>
                Să nu modifice, să nu reverse-engineereze și să nu exploateze vulnerabilități
                ale Aplicației.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibond text-[#E4E4F0]">6. Disponibilitate și întreținere</h2>
            <p>
              HIR depune eforturi rezonabile pentru disponibilitatea Aplicației 24/7, dar nu garantează
              funcționarea neîntreruptă. Mentenanța planificată va fi comunicată în avans când este
              posibil. HIR nu este răspunzătoare pentru pierderi cauzate de indisponibilitate.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">7. Proprietate intelectuală</h2>
            <p>
              Toate drepturile de proprietate intelectuală asupra Aplicației și conținutului acesteia
              aparțin HIR Technology SRL. Ți se acordă o licență limitată, neexclusivă, netransferabilă,
              exclusiv în scopul utilizării legitime descrise la art. 4.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">8. Confidențialitate</h2>
            <p>
              Prelucrarea datelor personale este guvernată de{' '}
              <Link href="/privacy" className="text-violet-400 hover:underline">
                Politica de Confidențialitate
              </Link>
              , parte integrantă din acești T&amp;C.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">9. Suspendare și reziliere</h2>
            <p>
              HIR poate suspenda sau dezactiva contul în caz de: încălcarea acestor T&amp;C,
              fraudă, comportament abuziv sau la cererea autorităților competente.
              Poți solicita ștergerea contului conform procedurii descrise la{' '}
              <Link href="/settings/delete-account" className="text-violet-400 hover:underline">
                Setări → Șterge cont
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">10. Limitarea răspunderii</h2>
            <p>
              HIR nu este responsabilă pentru daunele indirecte, incidentale sau consecvente.
              Răspunderea HIR în legătură cu utilizarea Aplicației este limitată la valoarea
              comisioanelor plătite de tine în luna anterioară incidentului.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">11. Drept aplicabil</h2>
            <p>
              Acești T&amp;C sunt guvernați de legea română. Orice litigiu va fi soluționat de
              instanțele competente din România. Consumatorii au dreptul să acceseze platforma
              de soluționare alternativă a litigiilor:{' '}
              <a
                href="https://anpc.ro/sal/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:underline"
              >
                ANPC SAL
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">12. Modificări</h2>
            <p>
              HIR poate modifica acești T&amp;C. Versiunea actuală este publicată la{' '}
              <code className="rounded bg-[#1C1C2E] px-1 py-0.5 text-xs">
                https://courier.hirforyou.ro/terms
              </code>
              . Continuarea utilizării Aplicației după publicarea modificărilor constituie acceptarea lor.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[#E4E4F0]">13. Contact</h2>
            <p>
              HIR Technology SRL &middot; România &middot;{' '}
              <a href="mailto:suport@hirforyou.ro" className="text-violet-400 hover:underline">
                suport@hirforyou.ro
              </a>
            </p>
          </section>

          <p className="mt-8 text-xs text-[#666680]">
            Ultima actualizare: mai 2026 &middot; Versiune 1.0
          </p>
        </div>
      </div>
    </div>
  );
}
