// Customer reactivation — template picker + WhatsApp URL helper.

const TEMPLATES = [
  "Salut {name}, ne lipsești! Te-am văzut ultima dată cu {topItem}. Reset de loialitate: cu codul REVINO15 ai 15% reducere săptămâna asta. https://hirforyou.ro/{slug}",
  "Bună {name}! E timpul pentru {topItem}? Comanda azi cu 20% off — codul COMEBACK. Doar până sâmbătă.",
  "Hei {name}, sper că ești bine. Vrei să încerci ceva nou la noi? Răspunde cu 'DA' și îți rezervăm o surpriză.",
] as const;

/**
 * Pick a template deterministically by hashing the phone number.
 * Same phone always gets the same template — cheap consistent A/B without
 * a harness.
 */
function pickTemplate(phone: string): string {
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = (hash * 31 + phone.charCodeAt(i)) >>> 0;
  }
  return TEMPLATES[hash % TEMPLATES.length];
}

/**
 * Replace {name}, {topItem}, {slug} tokens in the chosen template.
 */
export function renderTemplate(opts: {
  phone: string;
  name: string;
  topItem: string;
  slug: string;
}): string {
  const tpl = pickTemplate(opts.phone);
  return tpl
    .replace('{name}', opts.name)
    .replace('{topItem}', opts.topItem)
    .replace('{slug}', opts.slug);
}

/**
 * Build a wa.me deep-link for the given phone + message.
 * Normalises Romanian numbers: strips non-digits, replaces leading 0 with 40.
 */
export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const normalized = digits.startsWith('0') ? '40' + digits.slice(1) : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
