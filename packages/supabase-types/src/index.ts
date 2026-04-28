export type { Database, Json } from './database.types';
export { createBrowserSupabase } from './client-browser';
export { createServerSupabase } from './client-server';

// Restaurant vertical templates (data-only) live in their own package to
// avoid pulling them into every consumer of @hir/supabase-types. Import directly:
//   import { ALL_TEMPLATES, getTemplate, type RestaurantTemplate } from '@hir/restaurant-templates';
