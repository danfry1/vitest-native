import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  Image,
  Pressable,
  RefreshControl,
  Animated,
  StyleSheet,
} from 'react-native';

interface FeedItem {
  id: string;
  title: string;
  author: string;
  imageUrl: string;
  likes: number;
}

interface FeedSection {
  title: string;
  data: FeedItem[];
}

interface FeedListProps {
  items: FeedItem[];
  sections?: FeedSection[];
  onItemPress?: (item: FeedItem) => void;
  onRefresh?: () => Promise<void>;
  useSections?: boolean;
}

function FeedCard({ item, onPress }: { item: FeedItem; onPress?: (item: FeedItem) => void }) {
  const scaleAnim = new Animated.Value(1);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      testID={`feed-item-${item.id}`}
      onPress={() => onPress?.(item)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <Image testID={`feed-image-${item.id}`} source={{ uri: item.imageUrl }} style={styles.cardImage} />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardAuthor}>by {item.author}</Text>
          <Text testID={`likes-${item.id}`} style={styles.likes}>{item.likes} likes</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function FeedList({ items, sections, onItemPress, onRefresh, useSections }: FeedListProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh?.();
    setRefreshing(false);
  }, [onRefresh]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedCard item={item} onPress={onItemPress} />,
    [onItemPress],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const ListEmpty = () => (
    <View testID="empty-feed" style={styles.empty}>
      <Text style={styles.emptyText}>No posts yet</Text>
    </View>
  );

  const ListHeader = () => (
    <View testID="feed-header">
      <Text style={styles.headerText}>Your Feed</Text>
    </View>
  );

  if (useSections && sections) {
    return (
      <SectionList
        testID="section-feed"
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View testID={`section-${section.title}`}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmpty}
        refreshControl={
          <RefreshControl testID="refresh" refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />
    );
  }

  return (
    <FlatList
      testID="flat-feed"
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      refreshControl={
        <RefreshControl testID="refresh" refreshing={refreshing} onRefresh={handleRefresh} />
      }
    />
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 8, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  cardImage: { width: '100%', height: 200, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  cardContent: { padding: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardAuthor: { fontSize: 14, color: '#666', marginTop: 4 },
  likes: { fontSize: 12, color: '#999', marginTop: 4 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
  headerText: { fontSize: 24, fontWeight: '700', padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', padding: 16, backgroundColor: '#f5f5f5' },
});
