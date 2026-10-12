import { collectionAssets } from '@/features/learning/assets/collection-assets';

// Local seed codes are aliases of the same artwork; unknown codes stay placeholders.
export function collectionArtwork(code: string | null | undefined) {
  if (!code) return undefined;
  const key = code.toUpperCase().replace(/^DEV_/, '');
  return Object.hasOwn(collectionAssets, key) ? collectionAssets[key] : undefined;
}
