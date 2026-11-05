// The home screen's blocks, in the order of the website's landing page
// (HomeClient + Hero): header, hero, search, chain strip, rails, banner,
// category tiles. The screen file only fetches data and stacks them.
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Chain, DealCard, MetaResponse } from '@/lib/api';
import { DealCardView } from '@/components/deal-card';
import { Colors, Fonts, Radius, Space, useType } from '@/constants/theme';
import { formatCount } from './count';
import { ArrowRightIcon, CategoryIcon, GearIcon, ListIcon, SearchIcon } from './icons';

export function HomeHeader({ listCount }: { listCount: number }) {
  return (
    <View style={s.header}>
      <View style={s.mark} accessible accessibilityLabel="Προσφορές Παντού">
        <Text style={s.markText}>Π</Text>
      </View>
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel="Ρυθμίσεις"
        hitSlop={4}
        style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
        <GearIcon size={26} color={Colors.brand} />
      </Pressable>
      <Pressable
        onPress={() => router.navigate('/list')}
        accessibilityRole="button"
        accessibilityLabel={listCount > 0 ? `Η λίστα μου, ${listCount} προϊόντα` : 'Η λίστα μου'}
        hitSlop={4}
        style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
        <ListIcon size={26} color={Colors.brand} />
        {listCount > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{listCount > 99 ? '99+' : listCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export function HomeHero({ total, chainCount }: { total: number; chainCount: number }) {
  const T = useType();
  return (
    <View style={s.hero}>
      <Text style={[T.text.hero, s.heroLine]} accessibilityRole="header">
        Όλες οι προσφορές,
        {'\n'}
        <Text style={[T.text.heroItalic, { color: Colors.brand2 }]}>σε ένα μέρος</Text>
      </Text>
      <View style={s.trust}>
        <Text style={[T.text.body, s.trustText]}>
          <Text style={[T.text.bodyStrong, { color: Colors.ink }]}>{formatCount(total)}</Text> προσφορές
        </Text>
        {chainCount > 0 ? (
          <>
            <Text style={[T.text.body, s.trustText]}>·</Text>
            <Text style={[T.text.body, s.trustText]}>
              <Text style={[T.text.bodyStrong, { color: Colors.ink }]}>{chainCount}</Text> αλυσίδες
            </Text>
          </>
        ) : null}
        <View style={s.liveDot} />
      </View>
      <Text style={[T.text.body, s.trustText, { marginTop: 2 }]}>Ενημερώνεται καθημερινά</Text>
    </View>
  );
}

// Looks like the website's big search pill; the field itself lives on the
// Search tab, which focuses its input on ?focus=1.
export function SearchPill() {
  const T = useType();
  const open = () => router.navigate({ pathname: '/search', params: { focus: '1' } });
  return (
    <Pressable onPress={open} accessibilityRole="search" accessibilityLabel="Αναζήτηση προσφορών" style={s.search}>
      <SearchIcon size={22} color={Colors.ink3Text} />
      <Text style={[T.text.body, s.searchHint]} numberOfLines={1}>
        Τι ψάχνεις;
      </Text>
      <View style={s.searchBtn}>
        <Text style={[T.text.button, { color: '#fff' }]}>Αναζήτηση</Text>
      </View>
    </Pressable>
  );
}

export function ChainStrip({ chains }: { chains: Chain[] }) {
  const T = useType();
  if (chains.length === 0) return null;
  return (
    <FlatList
      horizontal
      data={chains}
      keyExtractor={(c) => c.id}
      showsHorizontalScrollIndicator={false}
      style={s.bleed}
      contentContainerStyle={{ paddingHorizontal: Space[4], gap: Space[3] }}
      renderItem={({ item: c }) => (
        <Pressable
          onPress={() => router.navigate({ pathname: '/deals', params: { chain: c.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}, ${c.offers} προσφορές`}
          style={({ pressed }) => [s.chainTile, pressed && s.pressed]}>
          <View style={s.logoBox}>
            {c.logoUrl ? (
              <Image source={{ uri: c.logoUrl }} style={s.logo} contentFit="contain" />
            ) : (
              <Text style={[T.text.bodyStrong, { color: c.color }]}>{c.short}</Text>
            )}
          </View>
          <Text style={[T.text.caption, s.chainCount]} numberOfLines={1}>
            {formatCount(c.offers)}
          </Text>
        </Pressable>
      )}
    />
  );
}

// Two cards and a peek of the third, so the rail visibly scrolls.
export function railCardWidth(screenWidth: number) {
  return Math.floor((screenWidth - Space[4] - Space[3] * 2 - 28) / 2);
}

export function Rail({
  title,
  hint,
  deals,
  width,
  onSeeAll,
}: {
  title: string;
  hint?: string;
  deals: DealCard[];
  width: number;
  onSeeAll?: () => void;
}) {
  const T = useType();
  if (deals.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={[T.text.h2, s.h2]} accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text style={[T.text.body, s.hint]}>{hint}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`Δες όλες: ${title}`} hitSlop={8} style={s.seeAll}>
            <Text style={[T.text.bodyStrong, { color: Colors.brand }]}>Όλες</Text>
            <ArrowRightIcon size={16} color={Colors.brand} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={deals}
        keyExtractor={(d) => d.id}
        renderItem={({ item, index }) => <DealCardView deal={item} width={width} position={index} />}
        ItemSeparatorComponent={() => <View style={{ width: Space[3] }} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Space[4] }}
        style={s.bleed}
      />
    </View>
  );
}

// The site's `.promo` block: eyebrow, serif headline, gold button → all offers.
export function PromoBanner({ total }: { total: number }) {
  const T = useType();
  return (
    <Pressable onPress={() => router.navigate('/deals')} accessibilityRole="button" accessibilityLabel="Δες όλες τις προσφορές" style={s.promo}>
      <Text style={[T.text.caption, s.eyebrow]}>ΌΛΕΣ ΟΙ ΠΡΟΣΦΟΡΕΣ</Text>
      <Text style={[T.text.h2, s.promoTitle]}>Περιήγηση σε {formatCount(total)} προσφορές</Text>
      <Text style={[T.text.body, s.promoSub]}>Φίλτραρε ανά κατάστημα, κατηγορία ή τιμή</Text>
      <View style={s.goldBtn}>
        <Text style={[T.text.button, { color: Colors.brand }]}>Δες όλες</Text>
        <ArrowRightIcon size={18} color={Colors.brand} />
      </View>
    </Pressable>
  );
}

export function CategoryGrid({ categories }: { categories: MetaResponse['categories'] }) {
  const T = useType();
  const { width } = useWindowDimensions();
  const tileW = Math.floor((width - Space[4] * 2 - Space[2] * 2) / 3);
  const rows = useMemo(() => categories.filter((c) => c.offers > 0), [categories]);
  if (rows.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={[T.text.h2, s.h2, { marginBottom: Space[3] }]} accessibilityRole="header">
        Ανά κατηγορία
      </Text>
      <View style={s.catGrid}>
        {rows.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.navigate({ pathname: '/deals', params: { category: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${c.full}, ${c.offers} προσφορές`}
            style={({ pressed }) => [s.catTile, { width: tileW }, pressed && s.pressed]}>
            <View style={s.catIcon}>
              <CategoryIcon id={c.id} size={28} color={Colors.brand} />
            </View>
            <Text style={[T.text.caption, s.catLabel]} numberOfLines={2}>
              {c.label}
            </Text>
            <Text style={[T.text.caption, s.catCount]}>{formatCount(c.offers)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function HomeError({ onRetry }: { onRetry: () => void }) {
  const T = useType();
  return (
    <View style={s.error}>
      <Text style={[T.text.h2, { color: Colors.ink, textAlign: 'center' }]}>Δεν φορτώθηκαν οι προσφορές</Text>
      <Text style={[T.text.body, { color: Colors.ink2, marginTop: Space[2], textAlign: 'center' }]}>Έλεγξε τη σύνδεσή σου στο ίντερνετ.</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={s.retry}>
        <Text style={[T.text.button, { color: '#fff' }]}>Δοκίμασε ξανά</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  bleed: { marginHorizontal: -Space[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space[1], minHeight: 52 },
  mark: { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontFamily: Fonts.sans900, fontSize: 18, lineHeight: 24 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: Fonts.sans700, fontSize: 12, lineHeight: 16 },
  hero: { marginTop: Space[5] },
  heroLine: { color: Colors.ink },
  trust: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginTop: Space[3], flexWrap: 'wrap' },
  trustText: { color: Colors.ink3Text },
  liveDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.good, borderWidth: 3, borderColor: '#BFDDC9' },
  search: {
    marginTop: Space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.pill,
    paddingLeft: Space[4],
    paddingRight: 6,
    height: 64,
  },
  searchHint: { flex: 1, color: Colors.ink3Text },
  searchBtn: { height: 52, paddingHorizontal: Space[4], borderRadius: Radius.pill, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  chainTile: { alignItems: 'center', gap: 6, width: 84 },
  logoBox: {
    width: 84,
    height: 60,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  logo: { width: '100%', height: '100%' },
  chainCount: { color: Colors.ink3Text },
  section: { marginTop: Space[7] },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space[3], gap: Space[2] },
  h2: { color: Colors.ink },
  hint: { color: Colors.ink3Text, marginTop: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: Space[2] },
  promo: { marginTop: Space[7], backgroundColor: Colors.brand, borderRadius: Radius.lg, padding: Space[5], overflow: 'hidden' },
  eyebrow: { color: Colors.gold, fontFamily: Fonts.sans700, letterSpacing: 1 },
  promoTitle: { color: Colors.brandInk, marginTop: Space[2] },
  promoSub: { color: 'rgba(243,238,226,0.85)', marginTop: Space[1] },
  goldBtn: {
    marginTop: Space[4],
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    minHeight: 52,
    paddingHorizontal: Space[5],
    borderRadius: Radius.pill,
    backgroundColor: Colors.gold,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
  // Three columns: (100% - 2 gaps) / 3, via flexBasis so no width maths is needed.
  catTile: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingVertical: Space[3],
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
  },
  catIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  catLabel: { color: Colors.ink, textAlign: 'center', fontFamily: Fonts.sans500 },
  catCount: { color: Colors.ink3Text },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space[6] },
  retry: { marginTop: Space[5], minHeight: 52, justifyContent: 'center', backgroundColor: Colors.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6] },
});
