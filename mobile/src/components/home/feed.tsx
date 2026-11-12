// Home v2 building blocks that are driven by data: one rail per feed section,
// the category chips and «Είδες πρόσφατα». Nothing here knows a section id.
import { memo, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { DealCard, FeedSection, MetaResponse } from '@/lib/api';
import { DealCardView } from '@/components/deal-card';
import { useChains } from '@/lib/chains';
import { formatPrice } from '@/lib/format';
import { dedupeCards } from '@/lib/lists';
import { noteInterest } from '@/lib/interest';
import { useImpressionTracker } from '@/lib/impressions';
import { useRecentlyViewed, type ViewedOffer } from '@/lib/recently-viewed';
import { Colors, Radius, Space, useType } from '@/constants/theme';
import { ArrowRightIcon, CategoryIcon } from './icons';

const GAP = Space[3];
const Separator = () => <View style={{ width: GAP }} />;

// «Όλες →» goes to the Προσφορές tab with exactly the section's parameters.
function openSeeAll(seeAll: NonNullable<FeedSection['seeAll']>) {
  const params: Record<string, string> = {};
  if (seeAll.chain) params.chain = seeAll.chain;
  if (seeAll.category) params.category = seeAll.category;
  if (seeAll.sort) params.sort = seeAll.sort;
  router.navigate({ pathname: '/deals', params });
}

// One component instance per rail = one useImpressionTracker call, so the
// FlatList always receives the same handlers (it throws otherwise).
export const FeedRail = memo(function FeedRail({ section, width }: { section: FeedSection; width: number }) {
  const T = useType();
  const tracker = useImpressionTracker('home:' + section.id);
  const deals = useMemo(() => dedupeCards(section.deals), [section.deals]);
  if (deals.length === 0) return null;
  return (
    <View style={s.rail} testID={`rail-${section.id}`}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={[T.text.h2, s.title]} accessibilityRole="header">
            {section.title}
          </Text>
          {section.subtitle ? <Text style={[T.text.body, s.subtitle]}>{section.subtitle}</Text> : null}
        </View>
        {section.seeAll ? (
          <Pressable
            onPress={() => openSeeAll(section.seeAll!)}
            accessibilityRole="button"
            accessibilityLabel={`Δες όλες: ${section.title}`}
            hitSlop={8}
            style={s.seeAll}>
            <Text style={[T.text.bodyStrong, { color: Colors.brand }]}>Όλες</Text>
            <ArrowRightIcon size={16} color={Colors.brand} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={deals}
        keyExtractor={cardKey}
        renderItem={({ item, index }) => <DealCardView deal={item} width={width} position={index} />}
        getItemLayout={(_, index) => ({ length: width, offset: Space[4] + index * (width + GAP), index })}
        ItemSeparatorComponent={Separator}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Space[4] }}
        {...tracker}
      />
    </View>
  );
});

const cardKey = (d: DealCard) => d.id;

export function CategoryChips({ categories }: { categories: MetaResponse['categories'] }) {
  const T = useType();
  const rows = useMemo(() => categories.filter((c) => c.offers > 0), [categories]);
  if (rows.length === 0) return null;
  return (
    <FlatList
      horizontal
      data={rows}
      keyExtractor={(c) => c.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Space[4], gap: Space[2] }}
      renderItem={({ item: c }) => (
        <Pressable
          onPress={() => {
            noteInterest('filter', { category: c.id });
            router.navigate({ pathname: '/deals', params: { category: c.id } });
          }}
          accessibilityRole="button"
          accessibilityLabel={`${c.full}, ${c.offers} προσφορές`}
          style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]}>
          <CategoryIcon id={c.id} size={22} color={Colors.brand} />
          <Text style={[T.text.chip, { color: Colors.ink }]}>{c.label}</Text>
        </Pressable>
      )}
    />
  );
}

export function RecentRail() {
  const T = useType();
  const { items } = useRecentlyViewed();
  if (items.length === 0) return null;
  return (
    <View style={s.rail} testID="rail-recent">
      <Text style={[T.text.h2, s.title, { paddingHorizontal: Space[4], marginBottom: Space[3] }]} accessibilityRole="header">
        Είδες πρόσφατα
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={viewedKey}
        renderItem={({ item }) => <RecentCard item={item} />}
        ItemSeparatorComponent={Separator}
        initialNumToRender={4}
        windowSize={3}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Space[4] }}
      />
    </View>
  );
}

const viewedKey = (v: ViewedOffer) => v.id;

function RecentCard({ item }: { item: ViewedOffer }) {
  const T = useType();
  const chains = useChains();
  const color = chains.find((c) => c.id === item.chain)?.color ?? Colors.ink3Text;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/offer/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatPrice(item.price)}`}
      style={({ pressed }) => [s.recent, pressed && { opacity: 0.7 }]}>
      <View style={s.thumb}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[T.text.secondary, { color: Colors.ink }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={s.priceRow}>
          <View style={[s.dot, { backgroundColor: color }]} />
          <Text style={[T.text.bodyStrong, { color: Colors.ink }]}>{formatPrice(item.price)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  rail: { marginTop: Space[6] },
  head: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space[3], gap: Space[2], paddingHorizontal: Space[4] },
  title: { color: Colors.ink },
  subtitle: { color: Colors.ink3Text, marginTop: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: Space[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    minHeight: 48,
    paddingHorizontal: Space[4],
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.pill,
  },
  recent: {
    width: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[3],
    padding: Space[2],
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
  },
  thumb: { width: 60, height: 60, borderRadius: Radius.sm, backgroundColor: Colors.surface2, overflow: 'hidden' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Space[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
