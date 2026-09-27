import { buildCollectionAlbum } from '@/features/learning/utils/collection-album';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function fetchCollectionAlbum(childId: string, themeCode: string) {
  const client = getSupabaseClient();
  const catalog: { id: string }[] = [];
  const owned = [];
  // Explicit pagination: never report completion from a truncated catalog.
  for (let offset = 0; ; offset += 500) {
    const result = await client
      .from('collectible_catalog')
      .select('id,sort_order')
      .eq('theme_code', themeCode)
      .eq('is_active', true)
      .order('sort_order')
      .order('id')
      .range(offset, offset + 499);
    if (result.error) throw result.error;
    catalog.push(...result.data);
    if (result.data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const result = await client
      .from('child_collectibles')
      .select('collectible_catalog_id,status,revealed_at,progress_points,growth_goal_snapshot')
      .eq('child_id', childId)
      .eq('theme_code', themeCode)
      .order('id')
      .range(offset, offset + 499);
    if (result.error) throw result.error;
    owned.push(...result.data);
    if (result.data.length < 500) break;
  }
  const activeIds = new Set(catalog.map((item) => item.id));
  const revealedIds = owned
    .filter((item) => item.revealed_at && activeIds.has(item.collectible_catalog_id))
    .map((item) => item.collectible_catalog_id);
  const names: { id: string; name: string }[] = [];
  for (let offset = 0; offset < revealedIds.length; offset += 200) {
    const result = await client
      .from('collectible_catalog')
      .select('id,name')
      .eq('theme_code', themeCode)
      .eq('is_active', true)
      .in('id', revealedIds.slice(offset, offset + 200));
    if (result.error) throw result.error;
    names.push(...result.data);
  }
  return buildCollectionAlbum(catalog, owned, names);
}
