// Daily generation orchestrator.
//
// Called from /api/content/generate-tick. For each active brand that
// hasn't received a draft in the last 24h, we:
//   1. Pick a default brief (pillar=promo, goal=awareness, persona=modern,
//      format=reel_ig). Real briefs from WhatsApp/Telegram inbound flow
//      through a separate path; this is the AUTO daily heartbeat that
//      keeps the patron seeing fresh content.
//   2. TemplatePickerAgent → exact/fallback match.
//   3. CopywriterAgent.fillTemplate with brand-derived placeholders.
//   4. SeoAgent.build for hashtags / meta.
//   5. VisualDirectorAgent.build.
//   6. VideoGenAgent.generate (mock provider falls back if API keys absent).
//   7. INSERT content_briefs + content_drafts.
//   8. Notify Hepi (WhatsApp / Telegram) once per brand if new drafts landed.
//
// Caps: we wire a CapChecker that calls `checkAndIncrementUsage(
// tenantId, 'content_os_videos')` so the Standard-plan 3-video monthly cap
// is enforced atomically BEFORE we burn a Pika/Runway credit.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types/database';
import {
  CopywriterAgent,
  SeoAgent,
  TemplatePickerAgent,
  VideoGenAgent,
  VisualDirectorAgent,
  CapExceededError,
  type BrandContext,
  type CapChecker,
  type CopywriterPlaceholders,
  type Format,
  type Persona,
  type Pillar,
  type CopyDraft,
} from '@hir/content-os';
import { BRAND_CONTEXT_COLUMNS, rowToBrandContext } from './brand-context';
import { buildTemplatesRepo } from './templates-repo';
import { checkAndIncrementUsage } from '@/lib/usage-caps';

export interface GenerateTickStats {
  processed: number;
  succeeded: number;
  failed: number;
  capped: number;
  notified: number;
}

interface GenerateOpts {
  admin: SupabaseClient<Database>;
  /** Inject the cap checker for tests — defaults to the real RPC. */
  capChecker?: CapChecker;
  /** Inject the notifier for tests — defaults to a stub when secrets absent. */
  notifyHepi?: (brand: BrandContext, message: string) => Promise<void>;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Default daily brief — patroni who want different briefs flow them in
// via WhatsApp/Telegram. This is the AUTO heartbeat so the dashboard
// always has something to show during demos.
const DEFAULT_DAILY_BRIEF: { pillar: Pillar; persona: Persona; goal: string; format: Format } = {
  pillar: 'promo',
  persona: 'modern',
  goal: 'awareness',
  format: 'reel_ig',
};

/**
 * Run one tick of the daily generation pipeline.
 *
 * Returns aggregated stats. Caller (route handler) JSON-encodes them
 * back to the cron caller for visibility.
 */
export async function runGenerateTick(opts: GenerateOpts): Promise<GenerateTickStats> {
  const { admin } = opts;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // 1. Active brands.
  const { data: brandRows, error: brandsErr } = await sb
    .from('content_brand_contexts')
    .select(BRAND_CONTEXT_COLUMNS)
    .eq('is_active', true);
  if (brandsErr) {
    throw new Error(`generate-tick: failed to load brands: ${brandsErr.message}`);
  }

  const stats: GenerateTickStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    capped: 0,
    notified: 0,
  };

  const templatePicker = new TemplatePickerAgent(buildTemplatesRepo(sb));
  const copywriter = new CopywriterAgent();
  const seo = new SeoAgent();
  const visualDirector = new VisualDirectorAgent();
  const videoGen = new VideoGenAgent();

  for (const row of (brandRows ?? []) as Array<Parameters<typeof rowToBrandContext>[0]>) {
    stats.processed += 1;
    const brand = rowToBrandContext(row);

    try {
      // Skip if a draft already landed in the last 24h for this brand.
      const { data: recentBriefs } = await sb
        .from('content_briefs')
        .select('id, created_at')
        .eq('brand_id', brand.id)
        .gte('created_at', cutoff)
        .limit(1);
      if ((recentBriefs ?? []).length > 0) {
        continue;
      }

      // 2. Template pick.
      const picked = await templatePicker.pick({
        businessType: brand.businessType ?? 'general',
        persona: DEFAULT_DAILY_BRIEF.persona,
        goal: DEFAULT_DAILY_BRIEF.goal,
        pillar: DEFAULT_DAILY_BRIEF.pillar,
        format: DEFAULT_DAILY_BRIEF.format,
      });
      if (!picked) {
        stats.failed += 1;
        continue;
      }

      // 3. Insert brief first so we have a stable parent for drafts.
      const { data: brief, error: briefErr } = await sb
        .from('content_briefs')
        .insert({
          brand_id: brand.id,
          pillar: DEFAULT_DAILY_BRIEF.pillar,
          persona: DEFAULT_DAILY_BRIEF.persona,
          goal: DEFAULT_DAILY_BRIEF.goal,
          source: 'cron_daily',
          template_id: picked.template.id,
          metadata: { match_kind: picked.matchKind, confidence: picked.confidence },
        })
        .select('id')
        .single();
      if (briefErr || !brief) {
        stats.failed += 1;
        continue;
      }

      // 4. Copywriter — template fill with brand-derived placeholders.
      const copy = copywriter.fillTemplate(
        picked.template.body_template,
        defaultPlaceholders(brand),
        brand,
      );

      // 5. SEO.
      const seoOutput = seo.build({
        brand,
        copyHook: copy.hook,
        copyBody: copy.body,
        format: DEFAULT_DAILY_BRIEF.format,
      });

      // 6. Visual director.
      const visual = visualDirector.build({
        brand,
        format: DEFAULT_DAILY_BRIEF.format,
        copyHook: copy.hook,
        visualBriefFromTemplate: picked.template.body_template.visual_brief,
      });

      // 7. Video gen — mock fallback when no API keys; cap-gated for
      // TENANT_SAAS brands. HIR_INTERNAL is self-managed so no cap.
      const isTenant = brand.kind === 'TENANT_SAAS' && brand.tenantId;
      const capChecker: CapChecker | undefined = isTenant
        ? opts.capChecker ?? defaultCapChecker
        : undefined;

      let videoUrl: string | undefined;
      let videoCostCents = 0;
      try {
        const videoResult = await videoGen.generate({
          brand,
          prompt: visual,
          clientReferenceId: brief.id,
          capChecker,
        });
        videoUrl = videoResult.videoUrl;
        videoCostCents = videoResult.costCents ?? 0;
      } catch (e) {
        if (e instanceof CapExceededError) {
          stats.capped += 1;
          // Continue WITHOUT video — the draft can still publish as a
          // static or text-only post. The patron sees a banner.
        } else {
          throw e;
        }
      }

      // 8. Persist the draft row. body_json carries the full agent stack
      // output so the UI can render it later without re-running anything.
      const bodyJson = buildBodyJson({
        copy,
        seo: seoOutput,
        visual,
        videoUrl,
      });

      const { error: draftErr } = await sb.from('content_drafts').insert({
        brief_id: brief.id,
        agent_kind: 'copywriter',
        format: DEFAULT_DAILY_BRIEF.format,
        body_json: bodyJson,
        language: 'ro',
        status: 'draft',
        cost_cents: videoCostCents,
      });
      if (draftErr) {
        stats.failed += 1;
        continue;
      }

      stats.succeeded += 1;

      // 9. Hepi notification (best-effort).
      if (opts.notifyHepi) {
        try {
          await opts.notifyHepi(
            brand,
            `Hai patroane, am pregătit un draft nou pentru ${brand.displayName}. Intră în dashboard să-l aprobi.`,
          );
          stats.notified += 1;
        } catch {
          // Don't fail the whole tick if a single notification fails.
        }
      }
    } catch (e) {
      stats.failed += 1;
      console.warn(`[content-os.generate] brand ${brand.brandCode} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return stats;
}

/**
 * Default placeholder bag pulled from BrandContext. Real briefs override
 * itemName / price / urgency from the inbound WhatsApp/Telegram message.
 */
function defaultPlaceholders(brand: BrandContext): CopywriterPlaceholders {
  const extra = brand.visual.extra as Record<string, unknown> | undefined;
  const city = (extra?.city as string | undefined) ?? '';
  return {
    businessName: brand.displayName,
    orașName: city,
    websiteUrl: (extra?.websiteUrl as string | undefined) ?? '',
    phoneNumber: (extra?.phoneNumber as string | undefined) ?? '',
    messengerHandle: (extra?.messengerHandle as string | undefined) ?? '',
    emoji: defaultEmoji(brand.businessType),
    dayContext: dayContextRo(new Date()),
  };
}

function defaultEmoji(businessType: BrandContext['businessType']): string {
  switch (businessType) {
    case 'pizza':
      return '🍕';
    case 'burger':
      return '🍔';
    case 'kebab':
      return '🥙';
    case 'sushi':
      return '🍣';
    case 'cafe':
      return '☕';
    case 'pharmacy':
      return '💊';
    default:
      return '✨';
  }
}

const RO_DAY_NAMES = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
function dayContextRo(now: Date): string {
  return RO_DAY_NAMES[now.getDay()] ?? '';
}

function buildBodyJson(opts: {
  copy: CopyDraft;
  seo: ReturnType<SeoAgent['build']>;
  visual: ReturnType<VisualDirectorAgent['build']>;
  videoUrl: string | undefined;
}): Record<string, unknown> {
  return {
    hook: opts.copy.hook,
    body: opts.copy.body,
    cta: opts.copy.cta,
    hashtags: opts.copy.hashtags.length > 0 ? opts.copy.hashtags : opts.seo.hashtags,
    fullText: opts.copy.fullText,
    seo: {
      metaTitle: opts.seo.metaTitle,
      metaDescription: opts.seo.metaDescription,
      altText: opts.seo.altText,
    },
    visual: {
      prompt: opts.visual.prompt,
      aspectRatio: opts.visual.aspectRatio,
      durationSec: opts.visual.durationSec,
      styleTags: opts.visual.styleTags,
      videoUrl: opts.videoUrl,
    },
  };
}

/**
 * Default cap checker — wraps `checkAndIncrementUsage` so VideoGenAgent
 * stays portable (no Supabase coupling inside the package). Tests
 * inject a fake.
 */
const defaultCapChecker: CapChecker = async (tenantId: string) => {
  const result = await checkAndIncrementUsage(tenantId, 'content_os_videos', 1);
  return {
    allowed: result.allowed,
    message: result.message,
    used: result.used,
    cap: result.cap,
  };
};
