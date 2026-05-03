// HIR AI Tenant Orchestrator — agent + action_category catalog.
//
// Single source of truth for every (agent, action_category) pair the UI
// shows on /dashboard/settings/ai-trust. The orchestrator and all sub-agent
// helpers also consume this list to validate inputs.
//
// Adding a new sub-agent or action category here is a no-op for the DB
// (rows are upserted on first owner change). Mark `is_destructive: true`
// for anything that can't be auto-reverted in <24h or that touches money.

export type AgentName =
  | 'menu'
  | 'marketing'
  | 'operations'
  | 'customer_service'
  | 'analytics'
  | 'finance'
  | 'compliance'
  | 'growth';

export type ActionCategoryDef = {
  agent: AgentName;
  agentLabel: string;
  category: string;
  label: string;
  description: string;
  isDestructive: boolean;
};

// Sprint 12 ships only Menu Agent v0; the others are listed (greyed at
// PROPOSE_ONLY) so the owner can preview the full surface area. Each
// future sub-agent will fill in its own categories as it ships.
export const AGENT_CATALOG: ActionCategoryDef[] = [
  // --- Menu Agent (Sprint 12) ---
  {
    agent: 'menu',
    agentLabel: 'Meniu',
    category: 'menu.bulk_import',
    label: 'Import meniu cu AI',
    description: 'Parsează PDF/imagine și creează categorii + produse în meniu.',
    isDestructive: false,
  },
  {
    agent: 'menu',
    agentLabel: 'Meniu',
    category: 'menu.description.update',
    label: 'Editare descriere produs',
    description: 'Generează sau îmbunătățește descrierile produselor.',
    isDestructive: false,
  },
  {
    agent: 'menu',
    agentLabel: 'Meniu',
    category: 'menu.photo.upload',
    label: 'Adăugare poză produs',
    description: 'Atașează poze (AI generate sau prin upload) la produse.',
    isDestructive: false,
  },
  {
    agent: 'menu',
    agentLabel: 'Meniu',
    category: 'menu.price.change',
    label: 'Modificare preț',
    description: 'Modifică prețul unui produs din meniu.',
    isDestructive: true,
  },
  {
    agent: 'menu',
    agentLabel: 'Meniu',
    category: 'menu.item.delete',
    label: 'Ștergere produs',
    description: 'Șterge un produs din meniu.',
    isDestructive: true,
  },

  // --- Marketing Agent (Sprint 14) ---
  {
    agent: 'marketing',
    agentLabel: 'Marketing',
    category: 'marketing.post.draft',
    label: 'Schiță postare social',
    description: 'Pregătește postări Facebook/Instagram pentru aprobare.',
    isDestructive: false,
  },
  {
    agent: 'marketing',
    agentLabel: 'Marketing',
    category: 'marketing.post.publish',
    label: 'Publicare postare',
    description: 'Publică direct pe Facebook/Instagram.',
    isDestructive: true,
  },
  {
    agent: 'marketing',
    agentLabel: 'Marketing',
    category: 'marketing.email.campaign',
    label: 'Campanie email',
    description: 'Trimite campanii email către clienți.',
    isDestructive: true,
  },

  // --- Customer Service Agent (Sprint 14) ---
  {
    agent: 'customer_service',
    agentLabel: 'Suport clienți',
    category: 'cs.review.reply',
    label: 'Răspuns la recenzie',
    description: 'Răspunde public la recenzii pozitive/negative.',
    isDestructive: false,
  },
  {
    agent: 'customer_service',
    agentLabel: 'Suport clienți',
    category: 'cs.refund.issue',
    label: 'Rambursare comandă',
    description: 'Procesează rambursare către client.',
    isDestructive: true,
  },
];

export function listCatalogByAgent(): Map<AgentName, ActionCategoryDef[]> {
  const map = new Map<AgentName, ActionCategoryDef[]>();
  for (const def of AGENT_CATALOG) {
    if (!map.has(def.agent)) map.set(def.agent, []);
    map.get(def.agent)!.push(def);
  }
  return map;
}

export function isKnownActionCategory(agent: string, category: string): boolean {
  return AGENT_CATALOG.some((d) => d.agent === agent && d.category === category);
}
