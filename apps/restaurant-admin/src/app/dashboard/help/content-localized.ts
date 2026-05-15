// Locale-aware view over the canonical RO help tree (`./content.ts`).
//
// We do not duplicate slugs, relations or CTA hrefs in EN — those are
// structural. Only the user-facing strings are overlaid from
// `./content.en.ts`. If a translation is missing, we fall back to RO so
// nothing 500s — translation gaps are visible but harmless.

import type { HelpLocale } from '@/lib/i18n/help-locale';
import {
  HELP_CATEGORIES,
  findTopic as findTopicRo,
  getAllTopics as getAllTopicsRo,
  type HelpCategory,
  type HelpTopic,
} from './content';
import {
  HELP_CATEGORIES_EN,
  HELP_TOPICS_EN,
  HELP_UI_EN,
  HELP_UI_RO,
  type HelpCategoryEn,
  type HelpTopicEn,
} from './content.en';

export type LocalizedTopic = HelpTopic;
export type LocalizedCategory = HelpCategory;

function applyTopicEn(t: HelpTopic, en: HelpTopicEn | undefined): HelpTopic {
  if (!en) return t;
  return {
    ...t,
    title: en.title,
    summary: en.summary,
    intro: en.intro,
    steps: en.steps ?? t.steps,
    outro: en.outro ?? t.outro,
    screenshot: en.screenshot ?? t.screenshot,
    cta: t.cta && en.cta ? { label: en.cta.label, href: t.cta.href } : t.cta,
  };
}

function applyCategoryEn(c: HelpCategory, en: HelpCategoryEn | undefined): HelpCategory {
  if (!en) return c;
  return { ...c, title: en.title, description: en.description };
}

export function getLocalizedCategories(locale: HelpLocale): HelpCategory[] {
  if (locale === 'ro') return HELP_CATEGORIES;
  return HELP_CATEGORIES.map((c) => ({
    ...applyCategoryEn(c, HELP_CATEGORIES_EN[c.slug]),
    topics: c.topics.map((t) => applyTopicEn(t, HELP_TOPICS_EN[t.slug])),
  }));
}

export function getLocalizedAllTopics(locale: HelpLocale): HelpTopic[] {
  if (locale === 'ro') return getAllTopicsRo();
  return getAllTopicsRo().map((t) => applyTopicEn(t, HELP_TOPICS_EN[t.slug]));
}

export function findLocalizedTopic(
  slug: string,
  locale: HelpLocale,
): { topic: HelpTopic; category: HelpCategory } | null {
  const found = findTopicRo(slug);
  if (!found) return null;
  if (locale === 'ro') return found;
  return {
    topic: applyTopicEn(found.topic, HELP_TOPICS_EN[slug]),
    category: applyCategoryEn(found.category, HELP_CATEGORIES_EN[found.category.slug]),
  };
}

export function getHelpUi(locale: HelpLocale) {
  return locale === 'en' ? HELP_UI_EN : HELP_UI_RO;
}
