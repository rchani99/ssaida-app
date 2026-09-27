import type { ChildCollectible } from '@/features/learning/types/learning.types';

export type AlbumOwnedItem = Pick<
  ChildCollectible,
  'collectible_catalog_id' | 'status' | 'revealed_at' | 'progress_points' | 'growth_goal_snapshot'
>;
export type AlbumEntry = {
  id: string;
  name: string;
  state: 'collected' | 'growing' | 'ready' | 'locked';
  progress: number;
};
export type CollectionAlbum = {
  entries: AlbumEntry[];
  total: number;
  collected: number;
  isComplete: boolean;
};

export function buildCollectionAlbum(
  catalog: { id: string }[],
  owned: AlbumOwnedItem[],
  revealedNames: { id: string; name: string }[],
): CollectionAlbum {
  const byId = new Map(owned.map((item) => [item.collectible_catalog_id, item]));
  const names = new Map(revealedNames.map((item) => [item.id, item.name]));
  const entries: AlbumEntry[] = catalog.map(({ id }) => {
    const item = byId.get(id);
    const state = item?.revealed_at
      ? 'collected'
      : item?.status === 'COMPLETED'
        ? 'ready'
        : item?.status === 'GROWING'
          ? 'growing'
          : 'locked';
    return {
      id,
      // Never carry hidden identity into display props, even if a caller supplies it.
      name: state === 'collected' ? (names.get(id) ?? '수집한 친구') : '???',
      state,
      progress:
        item && item.growth_goal_snapshot > 0
          ? Math.min(
              100,
              Math.max(0, Math.floor((item.progress_points / item.growth_goal_snapshot) * 100)),
            )
          : 0,
    };
  });
  const collected = entries.filter((item) => item.state === 'collected').length;
  return {
    entries,
    total: entries.length,
    collected,
    isComplete: entries.length > 0 && collected === entries.length,
  };
}
