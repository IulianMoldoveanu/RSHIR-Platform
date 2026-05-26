// Bot rules engine for courier-facing chat support.
// Wolt-style: try to resolve common problems instantly, escalate to operator
// when the user explicitly asks OR when no rule matches.
//
// Each rule has a matcher (substring or regex) and a response template.
// `topic` is recorded on the conversation so operators can triage queue.

export type BotIntent =
  | 'greeting'
  | 'proof_issue'
  | 'payment_delay'
  | 'address_wrong'
  | 'app_crash'
  | 'shift_problem'
  | 'pricing_question'
  | 'fallback'
  | 'request_operator';

export type QuickReply = { label: string; value: string };

export type BotResponse = {
  intent: BotIntent;
  body: string;
  topic: string | null;
  // When true, the conversation should escalate to OPERATOR_QUEUE.
  escalate: boolean;
  // Quick-tap buttons shown under the bot message.
  quick_replies: QuickReply[];
};

const OPERATOR_PHRASES = [
  'vorbesc cu cineva',
  'vreau operator',
  'om real',
  'persoană',
  'operator',
  'iulian',
  'nu mă ajută',
  'nu ma ajuta',
  'altceva',
];

// Resolution acknowledgements — close the loop without escalating. Matches
// quick-reply success values like "A funcționat, mulțumesc" or "OK, mulțumesc".
// Codex P2: previously these fell into fallback and escalated to operator.
const RESOLUTION_PHRASES = [
  'a funcționat',
  'a functionat',
  'merge acum',
  'mulțumesc',
  'multumesc',
  'mersi',
  'ok, mul',
  'clar',
  'am sunat',
  'am sunat, nu răspunde',
  'văd câștigurile',
  'vad castigurile',
  'vad in app',
];

function matchAny(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { label: 'Problemă livrare', value: 'Am o problemă la livrare' },
  { label: 'Plată întârziată', value: 'Nu am primit plata' },
  { label: 'Adresă greșită', value: 'Adresa clientului e greșită' },
  { label: 'Aplicația se închide', value: 'Aplicația crapă' },
  { label: 'Operator', value: 'Vreau să vorbesc cu un operator' },
];

export function classify(message: string): BotResponse {
  // 0. Resolution acknowledgement — short-circuit, no escalation.
  // Quick-reply success buttons ("A funcționat", "Mulțumesc", etc.) must NOT
  // fall through to the fallback escalate branch. Codex P2.
  if (matchAny(message, RESOLUTION_PHRASES)) {
    return {
      intent: 'greeting', // reuse greeting intent — closes loop cleanly
      body:
        'Mă bucur că s-a rezolvat. Apasă "Închide" sus dacă vrei să termini conversația, ' +
        'sau scrie altă întrebare dacă mai ai nevoie.',
      topic: 'resolved',
      escalate: false,
      quick_replies: [],
    };
  }

  // 1. Explicit escalation always wins.
  if (matchAny(message, OPERATOR_PHRASES)) {
    return {
      intent: 'request_operator',
      body:
        'Bine, te conectez cu un operator. Stai pe fir — îți răspundem în câteva minute. ' +
        'Între timp scrie ce s-a întâmplat ca să nu pierdem timp.',
      topic: 'operator_request',
      escalate: true,
      quick_replies: [],
    };
  }

  // 2. Empty greeting / first message.
  if (
    message.trim().length === 0 ||
    /^(buna|salut|hello|hei|hi|noroc)\b/i.test(message.trim())
  ) {
    return {
      intent: 'greeting',
      body:
        'Salut! Sunt asistentul HIR Curier. Cu ce te pot ajuta? Apasă unul din butoanele de mai jos sau scrie problema ta.',
      topic: null,
      escalate: false,
      quick_replies: DEFAULT_QUICK_REPLIES,
    };
  }

  // 3. Proof-of-delivery problems.
  if (
    matchAny(message, [
      'dovada',
      'dovadă',
      'poza',
      'fotografie',
      'foto',
      'proof',
      'nu pot face',
      'nu se încarcă',
      'nu se incarca',
    ])
  ) {
    return {
      intent: 'proof_issue',
      body:
        'Pentru dovada de livrare:\n\n' +
        '1. Verifică să ai semnal mobil bun.\n' +
        '2. Aplicația trebuie să aibă permisiune la cameră (Setări → Aplicații).\n' +
        '3. Apasă din nou butonul "Fotografie dovadă" la marcarea livrării.\n\n' +
        'Dacă persistă, scrie aici "operator" și te ajutăm direct.',
      topic: 'proof',
      escalate: false,
      quick_replies: [
        { label: 'A funcționat', value: 'A funcționat, mulțumesc' },
        { label: 'Tot nu merge', value: 'Vreau operator' },
      ],
    };
  }

  // 4. Payment delay.
  if (
    matchAny(message, [
      'plată',
      'plata',
      'plata mea',
      'banii',
      'nu am primit',
      'când plătiți',
      'cand platiti',
      'plătiți',
      'payment',
    ])
  ) {
    return {
      intent: 'payment_delay',
      body:
        'Plățile către curieri se fac săptămânal, vinerea, pentru tura din săpt. anterioară. ' +
        'Suma se vede în secțiunea Câștiguri. Dacă au trecut mai mult de 7 zile lucrătoare ' +
        'fără plată, scrie "operator" și verificăm pe loc.',
      topic: 'payment',
      escalate: false,
      quick_replies: [
        { label: 'Vad in app', value: 'Mulțumesc, văd câștigurile' },
        { label: 'Operator', value: 'Vreau să vorbesc cu un operator' },
      ],
    };
  }

  // 5. Wrong address.
  if (
    matchAny(message, [
      'adresa greș',
      'adresa gres',
      'adresa nu',
      'nu găsesc',
      'nu gasesc',
      'adresă',
      'adresa',
      'localizare greș',
      'localizare gres',
    ])
  ) {
    return {
      intent: 'address_wrong',
      body:
        'Dacă adresa nu există sau e greșită:\n\n' +
        '1. Sună clientul direct (butonul Apelează în pagina comenzii).\n' +
        '2. Dacă nu răspunde 3 ori, marchează comanda "Imposibil de livrat — adresa greșită" și ' +
        'returnează produsul la restaurant.\n\n' +
        'Câștigul de livrare îți rămâne — plătim pentru deplasarea făcută.',
      topic: 'address',
      escalate: false,
      quick_replies: [
        { label: 'Am sunat', value: 'Am sunat, nu răspunde' },
        { label: 'Operator', value: 'Vreau operator' },
      ],
    };
  }

  // 6. App crash / technical.
  if (
    matchAny(message, [
      'crapă',
      'crapa',
      'crash',
      'se închide',
      'se inchide',
      'nu pornește',
      'nu porneste',
      'app',
      'aplicaț',
      'aplicatie',
      'aplicatia',
      'bug',
      'eroare',
    ])
  ) {
    return {
      intent: 'app_crash',
      body:
        'Încearcă pașii ăștia:\n\n' +
        '1. Închide complet aplicația (swipe sus, scoate-o din recente).\n' +
        '2. Repornește telefonul.\n' +
        '3. Verifică în Setări → HIR Curier să ai permisiuni: Locație "Tot timpul", Notificări ON, Cameră ON.\n' +
        '4. Dacă tot crapă, dă-mi versiunea app-ului (Setări → Despre) și descrierea exactă.',
      topic: 'app',
      escalate: false,
      quick_replies: [
        { label: 'Merge acum', value: 'A funcționat' },
        { label: 'Operator', value: 'Vreau operator' },
      ],
    };
  }

  // 7. Shift / schedule problem.
  if (
    matchAny(message, [
      'tura',
      'tură',
      'ture',
      'shift',
      'program',
      'nu pot porni',
      'concediu',
      'liber',
    ])
  ) {
    return {
      intent: 'shift_problem',
      body:
        'Pentru ture și program:\n\n' +
        '- Marchezi orele disponibile în Setări → Program.\n' +
        '- Tura efectivă o pornești apăsând "Pornește tura" în pagina principală.\n' +
        '- Dacă vrei să modifici un slot deja confirmat, cere modificarea din pagina Program și ' +
        'dispecerul (Iulian) o aprobă.',
      topic: 'shift',
      escalate: false,
      quick_replies: [
        { label: 'Vad in Program', value: 'OK, văd' },
        { label: 'Operator', value: 'Vreau operator' },
      ],
    };
  }

  // 8. Pricing / earnings question.
  if (
    matchAny(message, [
      'preț',
      'pret',
      'tarif',
      'cât primesc',
      'cat primesc',
      'comision',
      'taxă',
      'taxa',
      'kilometri',
      'km',
    ])
  ) {
    return {
      intent: 'pricing_question',
      body:
        'Tarif curier per zonă (Brașov):\n' +
        '• Zona 1 (0-6 km, urban): 15 RON\n' +
        '• Zona 2 (6-10 km): 24 RON\n' +
        '• Zona 3 (10-14 km): 28 RON\n' +
        '• Zona 4 (14+ km): 40 RON\n\n' +
        'Vezi Calculatorul tău în pagina Câștiguri — arată Brut + Bacșiș + Net.',
      topic: 'pricing',
      escalate: false,
      quick_replies: [
        { label: 'Clar', value: 'OK, mulțumesc' },
        { label: 'Operator', value: 'Vreau operator' },
      ],
    };
  }

  // 9. Fallback — escalate after a short bot apology.
  return {
    intent: 'fallback',
    body:
      'Nu sunt sigur că am înțeles. Te conectez cu un operator real. Scrie problema cât mai clar ' +
      'și îți răspundem în câteva minute.',
    topic: 'unknown',
    escalate: true,
    quick_replies: [],
  };
}
