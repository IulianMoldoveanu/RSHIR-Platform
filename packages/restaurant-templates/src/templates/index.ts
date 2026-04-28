import type { RestaurantTemplate, RestaurantTemplateSlug } from '../types';
import { italian } from './italian';
import { asian } from './asian';
import { fineDining } from './fine-dining';
import { bistro } from './bistro';
import { romanianTraditional } from './romanian-traditional';

export const ALL_TEMPLATES: RestaurantTemplate[] = [
  italian,
  asian,
  fineDining,
  bistro,
  romanianTraditional,
];

export function getTemplate(slug: RestaurantTemplateSlug | string): RestaurantTemplate | null {
  return ALL_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export { italian, asian, fineDining, bistro, romanianTraditional };
