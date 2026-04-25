// RSHIR-13: Claude Vision wrapper for menu image/PDF parsing.
// Lazy-init the SDK so missing ANTHROPIC_API_KEY only fails when the import
// flow is actually used (a typecheck or unrelated route should not crash).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MENU_MODEL = 'claude-sonnet-4-6';

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
): Promise<ParsedMenu> {
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
    throw new Error(`Unsupported MIME for menu parse: ${mimeType}`);
  }

  const response = await client.messages.create({
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

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content.');
  }

  const raw = stripJsonFences(textBlock.text);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(
      `Claude returned non-JSON output: ${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`,
    );
  }

  const result = parsedMenuSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Claude JSON failed validation: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}
