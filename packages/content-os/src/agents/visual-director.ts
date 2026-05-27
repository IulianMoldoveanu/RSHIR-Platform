// VisualDirectorAgent — composes cinematic prompts for video generation.
//
// We do NOT call any video API here. The agent's job is to take the
// template's `visual_brief` (or, for non-template flows, the copy hook +
// brand visual identity) and produce a structured prompt that any of the
// VideoProvider adapters (Runway / Pika / Veo / HeyGen) can consume.
//
// Output is provider-agnostic; each adapter translates it into the
// provider-specific JSON in its own implementation.

import type { BrandContext, Format } from '../types';

export interface VisualDirectorInput {
  brand: BrandContext;
  format: Format;
  copyHook: string;
  /** From the template, if present. Caller has already filled placeholders. */
  visualBriefFromTemplate?: string;
  /** Optional reference image for style consistency (logo, brand still). */
  referenceImageUrl?: string;
}

export interface ShotSpec {
  type: 'wide' | 'medium' | 'close_up' | 'macro' | 'overhead' | 'pov';
  subject: string;
  motion: 'static' | 'pan' | 'zoom_in' | 'zoom_out' | 'orbit' | 'handheld' | 'time_lapse';
  durationSec: number;
}

export interface VisualPrompt {
  prompt: string;            // full natural-language prompt
  shotList: ShotSpec[];
  aspectRatio: '9:16' | '1:1' | '16:9';
  durationSec: number;
  voiceoverText?: string;    // optional VO derived from copyHook
  voiceoverLanguage: 'ro' | 'en';
  referenceImageUrl?: string;
  styleTags: string[];       // ['warm_lighting', 'cinematic', 'shallow_dof']
}

const FORMAT_DURATION: Record<Format, number> = {
  video_tiktok: 18,
  reel_ig: 15,
  carousel_fb: 0,
  carousel_ig: 0,
  static_fb: 0,
  static_ig: 0,
  linkedin_post: 0,
  x_post: 0,
  meta_title: 0,
};

const FORMAT_ASPECT: Record<Format, '9:16' | '1:1' | '16:9'> = {
  video_tiktok: '9:16',
  reel_ig: '9:16',
  carousel_fb: '1:1',
  carousel_ig: '1:1',
  static_fb: '1:1',
  static_ig: '1:1',
  linkedin_post: '1:1',
  x_post: '16:9',
  meta_title: '16:9',
};

export class VisualDirectorAgent {
  build(input: VisualDirectorInput): VisualPrompt {
    const { brand, format, copyHook, visualBriefFromTemplate, referenceImageUrl } = input;

    const aspectRatio = FORMAT_ASPECT[format];
    const durationSec = FORMAT_DURATION[format];

    const styleTags = this.deriveStyleTags(brand);
    const palette = brand.visual.palette ?? [];

    // If we have a templated visual brief, use it as the primary prompt.
    // Otherwise we synthesize from copyHook + brand identity.
    const primary = visualBriefFromTemplate?.trim()
      || this.synthesizeFromHook(copyHook, brand, format);

    const promptParts = [primary];

    if (palette.length > 0) {
      promptParts.push(
        `Color palette: ${palette.slice(0, 4).join(', ')}.`,
      );
    }
    if (styleTags.length > 0) {
      promptParts.push(`Style: ${styleTags.join(', ')}.`);
    }
    promptParts.push(`Aspect ratio: ${aspectRatio}.`);

    const shotList = this.buildShotList(format, durationSec);

    // Voiceover only for video formats, and only when hook is short enough
    // to be read at a comfortable cadence (~3 words/sec).
    const voWords = copyHook.trim().split(/\s+/).length;
    const voFits = durationSec > 0 && voWords > 0 && voWords <= Math.max(3, Math.floor(durationSec * 2.5));
    const voiceoverText = voFits ? copyHook : undefined;

    return {
      prompt: promptParts.join(' '),
      shotList,
      aspectRatio,
      durationSec,
      voiceoverText,
      voiceoverLanguage: 'ro',
      referenceImageUrl,
      styleTags,
    };
  }

  private synthesizeFromHook(hook: string, brand: BrandContext, format: Format): string {
    const subject = brand.businessType ?? 'general business';
    const setting = brand.visual.extra?.setting as string | undefined;
    const settingPart = setting ?? 'authentic environment, warm lighting';
    return `${this.formatVerb(format)} of ${subject} for "${brand.displayName}": ${settingPart}. Hook on screen: "${hook}".`;
  }

  private formatVerb(format: Format): string {
    if (format === 'video_tiktok' || format === 'reel_ig') return 'Vertical short-form video';
    if (format === 'carousel_fb' || format === 'carousel_ig') return 'Three-frame square carousel';
    if (format === 'static_fb' || format === 'static_ig') return 'Single square hero image';
    if (format === 'linkedin_post') return 'Professional square hero image';
    if (format === 'x_post') return 'Wide hero image';
    return 'Landing page hero';
  }

  private deriveStyleTags(brand: BrandContext): string[] {
    const tags: string[] = [];
    const tone = brand.voice.tone;
    if (tone === 'amical') tags.push('warm_lighting', 'authentic', 'family');
    else if (tone === 'profesional') tags.push('clean', 'editorial', 'shallow_dof');
    else if (tone === 'tinerit') tags.push('vibrant_color', 'fast_paced', 'trendy');
    else tags.push('cinematic', 'natural_light');
    return tags;
  }

  private buildShotList(format: Format, durationSec: number): ShotSpec[] {
    if (durationSec === 0) {
      // Static / carousel formats — single composition.
      return [
        {
          type: 'medium',
          subject: 'hero subject centered',
          motion: 'static',
          durationSec: 0,
        },
      ];
    }
    // Video format — split duration into 3 shots for visual rhythm:
    // 0–3s hook (close), 3–end content (medium/wide), final 1s call-to-action.
    const ctaDur = 2;
    const remaining = Math.max(1, durationSec - 3 - ctaDur);
    return [
      {
        type: 'close_up',
        subject: 'hook subject — hero product or face',
        motion: 'zoom_in',
        durationSec: 3,
      },
      {
        type: 'medium',
        subject: 'context shot — environment + product use',
        motion: 'handheld',
        durationSec: remaining,
      },
      {
        type: 'close_up',
        subject: 'call-to-action — logo + URL overlay',
        motion: 'static',
        durationSec: ctaDur,
      },
    ];
  }
}
