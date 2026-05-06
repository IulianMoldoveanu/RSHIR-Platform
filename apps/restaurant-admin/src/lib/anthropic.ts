// RSHIR-13: Claude Vision wrapper for menu image/PDF parsing.
// Lazy-init the SDK so missing ANTHROPIC_API_KEY only fails when the import
// flow is actually used (a typecheck or unrelated route should not crash).

import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { z } from 'zod';

// Canonical Sonnet model id used across the repo (telegram-command-intake,
// supervise-fix, growth-agent-daily, fix-attempt). Keep in sync with those.
const MENU_MODEL = 'claude-sonnet-4-5-20250929';

// Classified failure modes surfaced to the route handler so the user-facing
// copy is consistent across the menu import surface. Anything we can't
// classify becomes 'unknown' and the route returns a generic fallback.
export type MenuParseFailureKind =
  | 'auth_or_billing'
  | 'rate_limited'
  | 'model_not_found'
  | 'invalid_input'
  | 'unknown';

export class MenuParseError extends Error {
  readonly kind: MenuParseFailureKind;
  readonly status: number | undefined;
  readonly providerType: string | undefined;
  constructor(
    kind: MenuParseFailureKind,
    message: string,
    opts?: { status?: number; providerType?: string },
  ) {
    super(message);
    this.name = 'MenuParseError';
    this.kind = kind;
    this.status = opts?.status;
    this.providerType = opts?.providerType;
  }
}

function extractProviderType(err: APIError): string | undefined {
  // Anthropic error body shape: { type: 'error', error: { type, message } }
  const body = (err as unknown as { error?: { error?: { type?: unknown } } }).error;
  const inner = body?.error?.type;
  return typeof inner === 'string' ? inner : undefined;
}

function classifyAnthropic(err: unknown): MenuParseError {
  if (err instanceof APIError) {
    const status = err.status as number | undefined;
    const providerType = extractProviderType(err);

    // 401 / authentication / 402-style billing surfaced as 400 with body
    // type=invalid_request_error + message containing "credit balance".
    if (
      status === 401 ||
      providerType === 'authentication_error' ||
      providerType === 'permission_error' ||
      providerType === 'credit_balance_too_low' ||
      (typeof err.message === 'string' && /credit balance/i.test(err.message))
    ) {
      return new MenuParseError('auth_or_billing', err.message, { status, providerType });
    }
    if (status === 429 || providerType === 'rate_limit_error' || providerType === 'overloaded_error') {
      return new MenuParseError('rate_limited', err.message, { status, providerType });
    }
    if (
      status === 404 ||
      providerType === 'not_found_error' ||
      (typeof err.message === 'string' && /model/i.test(err.message) && /not.*found|does not exist/i.test(err.message))
    ) {
      return new MenuParseError('model_not_found', err.message, { status, providerType });
    }
    if (status === 400 || status === 422 || providerType === 'invalid_request_error') {
      return new MenuParseError('invalid_input', err.message, { status, providerType });
    }
    return new MenuParseError('unknown', err.message, { status, providerType });
  }
  if (err instanceof MenuParseError) return err;
  const message = err instanceof Error ? err.message : 'Parsare esuata';
  return new MenuParseError('unknown', message);
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  price_ron: z.coerce.number().nonnegative().max(100000),
  modifiers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        price_delta_ron: z.coerce.number().min(-100000).max(100000).optional().default(0),
      }),
    )
    .optional()
    .default([]),
  flagged: z.boolean().optional().default(false),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(itemSchema).default([]),
});

export const parsedMenuSchema = z.object({
  categories: z.array(categorySchema).default([]),
});

export type ParsedMenu = z.infer<typeof parsedMenuSchema>;
export type ParsedMenuItem = z.infer<typeof itemSchema>;

export type ParseMenuResult = {
  parsed: ParsedMenu;
  model: string;
  usage: {
    input_tokens: number | null;
    output_tokens: number;
  } | null;
};

const SYSTEM_PROMPT = `You extract restaurant menus from images and PDFs into strict JSON.

Output rules — these are mandatory:
- Return ONLY valid JSON. No prose, no Markdown fences, no comments.
- JSON shape: {"categories":[{"name":"...","items":[{"name":"...","description":"...","price_ron":0,"modifiers":[{"name":"...","price_delta_ron":0}],"flagged":false}]}]}.
- All prices are numbers in RON (Romanian leu). Strip "lei", "RON", "ron", currency symbols, and thousand separators. Use a dot as the decimal separator.
- If a price is unclear, missing, or ambiguous, set price_ron to 0 and flagged to true.
- Group items under the category heading printed on the menu. If no heading is present, use the category name "Necategorizate".
- Skip non-food rows: Wi-Fi passwords, allergen footers, page numbers, opening hours, addresses, taglines.
- Items keep their source language (Romanian or English). Do NOT translate.
- Modifiers (sizes, toppings, extras) are optional. Include them when clearly listed; otherwise return modifiers as [].
- If you cannot read the file at all, return {"categories":[]}.`;

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Menu import requires a Claude API key — see .env.local.example.',
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

type SupportedImageMime = 'image/jpeg' | 'image/png';

function isImageMime(mime: string): mime is SupportedImageMime {
  return mime === 'image/jpeg' || mime === 'image/png';
}

export async function parseMenuImage(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<ParseMenuResult> {
  const client = getClient();
  const data = Buffer.from(bytes).toString('base64');

  const isPdf = mimeType === 'application/pdf';
  let attachment;
  if (isPdf) {
    attachment = {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data,
      },
    };
  } else if (isImageMime(mimeType)) {
    attachment = {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mimeType,
        data,
      },
    };
  } else {
    throw new MenuParseError('invalid_input', `Unsupported MIME for menu parse: ${mimeType}`);
  }

  let response;
  try {
    response = await client.messages.create({
      model: MENU_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            attachment,
            {
              type: 'text',
              text: 'Extract this menu. Return only the JSON object as instructed.',
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw classifyAnthropic(err);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new MenuParseError('unknown', 'Claude returned no text content.');
  }

  const raw = stripJsonFences(textBlock.text);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new MenuParseError(
      'unknown',
      `Claude returned non-JSON output: ${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`,
    );
  }

  const result = parsedMenuSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new MenuParseError(
      'unknown',
      `Claude JSON failed validation: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  return {
    parsed: result.data,
    model: MENU_MODEL,
    usage: response.usage
      ? {
          input_tokens: response.usage.input_tokens ?? null,
          output_tokens: response.usage.output_tokens,
        }
      : null,
  };
}
