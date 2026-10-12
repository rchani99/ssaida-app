import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { childCollectionTokens as reward } from '@/design-system/tokens';
import { collectionArtwork } from '@/features/learning/utils/collection-artwork';

export function CollectionArtwork({ code, hero = false }: { code?: string; hero?: boolean }) {
  const artwork = collectionArtwork(code);
  return (
    <View style={[styles.art, hero && styles.hero]}>
      {artwork ? (
        <Image
          source={artwork.complete}
          contentFit="contain"
          style={styles.image}
          accessible={false}
          recyclingKey={code}
        />
      ) : (
        <Text accessible={false} style={styles.symbol}>
          ✦
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: 240, height: 240, alignSelf: 'center' },
  image: { width: '100%', height: '100%' },
  symbol: { fontSize: 56, color: reward.butterInk },
});
