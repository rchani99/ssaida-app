import { useQuery } from '@tanstack/react-query';

import { fetchCollectionAlbum } from '@/features/learning/api/collection-album-api';

export function useCollectionAlbum(childId?: string, themeCode?: string | null) {
  return useQuery({
    queryKey: ['learning', 'collection-album', childId, themeCode],
    queryFn: () => fetchCollectionAlbum(childId!, themeCode!),
    enabled: Boolean(childId && themeCode),
  });
}
