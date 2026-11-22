import { useMemo } from 'react';
// The home screen's blocks, in the order of the website's landing page
// (HomeClient + Hero): header, hero, search, chain strip, rails, banner,
// category tiles. The screen file only fetches data and stacks them.
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Chain } from '@/lib/api';
import { Fonts, Radius, Space, useType, useColors, type Palette, readableOn } from '@/constants/theme';
import { formatCount } from './count';
import { ArrowRightIcon, GearIcon, ListIcon, SearchIcon } from './icons';

export function HomeHeader({ listCount }: { listCount: number }) {
  const s = useS();
  const C = useColors();
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
        <GearIcon size={26} color={C.brandText} />
      </Pressable>
      <Pressable
        onPress={() => router.navigate('/list')}
        accessibilityRole="button"
        accessibilityLabel={listCount > 0 ? `Η λίστα μου, ${listCount} προϊόντα` : 'Η λίστα μου'}
        hitSlop={4}
        style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
        <ListIcon size={26} color={C.brandText} />
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
  const s = useS();
  const T = useType();
  const C = T.c;
  return (
    <View style={s.hero}>
      <Text style={[T.text.hero, s.heroLine]} accessibilityRole="header">
        Όλες οι προσφορές,
        {'\n'}
        <Text style={[T.text.heroItalic, { color: C.brand2 }]}>σε ένα μέρος</Text>
      </Text>
      <View style={s.trust}>
        <Text style={[T.text.body, s.trustText]}>
          <Text style={[T.text.bodyStrong, { color: C.ink }]}>{formatCount(total)}</Text> προσφορές
        </Text>
        {chainCount > 0 ? (
          <>
            <Text style={[T.text.body, s.trustText]}>·</Text>
            <Text style={[T.text.body, s.trustText]}>
              <Text style={[T.text.bodyStrong, { color: C.ink }]}>{chainCount}</Text> αλυσίδες
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
  const s = useS();
  const T = useType();
  const C = T.c;
  const open = () => router.navigate({ pathname: '/search', params: { focus: '1' } });
  return (
    <Pressable onPress={open} accessibilityRole="search" accessibilityLabel="Αναζήτηση προσφορών" style={s.search}>
      <SearchIcon size={22} color={C.ink3Text} />
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
  const s = useS();
  const T = useType();
  const C = T.c;
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
              <Text style={[T.text.bodyStrong, { color: readableOn(c.color, C.imageBg, C.ink) }]}>{c.short}</Text>
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

// The site's `.promo` block: eyebrow, serif headline, gold button → all offers.
export function PromoBanner({ total }: { total: number }) {
  const s = useS();
  const T = useType();
  const C = T.c;
  return (
    <Pressable onPress={() => router.navigate('/deals')} accessibilityRole="button" accessibilityLabel="Δες όλες τις προσφορές" style={s.promo}>
      <Text style={[T.text.caption, s.eyebrow]}>ΟΛΕΣ ΟΙ ΠΡΟΣΦΟΡΕΣ</Text>
      <Text style={[T.text.h2, s.promoTitle]}>Περιήγηση σε {formatCount(total)} προσφορές</Text>
      <Text style={[T.text.body, s.promoSub]}>Φίλτραρε ανά κατάστημα, κατηγορία ή τιμή</Text>
      <View style={s.goldBtn}>
        <Text style={[T.text.button, { color: C.promo }]}>Δες όλες</Text>
        <ArrowRightIcon size={18} color={C.promo} />
      </View>
    </Pressable>
  );
}

export function HomeError({ onRetry }: { onRetry: () => void }) {
  const s = useS();
  const T = useType();
  const C = T.c;
  return (
    <View style={s.error}>
      <Text style={[T.text.h2, { color: C.ink, textAlign: 'center' }]}>Δεν φορτώθηκαν οι προσφορές</Text>
      <Text style={[T.text.body, { color: C.ink2, marginTop: Space[2], textAlign: 'center' }]}>Έλεγξε τη σύνδεσή σου στο ίντερνετ.</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={s.retry}>
        <Text style={[T.text.button, { color: '#fff' }]}>Δοκίμασε ξανά</Text>
      </Pressable>
    </View>
  );
}

const makeS = (C: Palette) => StyleSheet.create({
  pressed: { opacity: 0.7 },
  bleed: { marginHorizontal: -Space[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space[1], minHeight: 52 },
  mark: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: Fonts.sans700, fontSize: 12, lineHeight: 16 },
  hero: { marginTop: Space[2] },
  heroLine: { color: C.ink },
  trust: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginTop: Space[2], flexWrap: 'wrap' },
  trustText: { color: C.ink3Text },
  liveDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.good, borderWidth: 3, borderColor: C.liveRing },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space[2],
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: Radius.pill,
    paddingLeft: Space[4],
    paddingRight: 6,
    height: 64,
  },
  searchHint: { flex: 1, color: C.ink3Text },
  searchBtn: { height: 52, paddingHorizontal: Space[4], borderRadius: Radius.pill, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  chainTile: { alignItems: 'center', gap: 6, width: 84 },
  logoBox: {
    width: 84,
    height: 60,
    borderRadius: Radius.md,
    backgroundColor: C.imageBg,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  logo: { width: '100%', height: '100%' },
  chainCount: { color: C.ink3Text },
  promo: { backgroundColor: C.promo, borderRadius: Radius.lg, padding: Space[5], overflow: 'hidden' },
  eyebrow: { color: C.gold, fontFamily: Fonts.sans700, letterSpacing: 1 },
  promoTitle: { color: C.brandInk, marginTop: Space[2] },
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
    backgroundColor: C.gold,
  },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space[6] },
  retry: { marginTop: Space[5], minHeight: 52, justifyContent: 'center', backgroundColor: C.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6] },
});

// Rebuilt when the palette changes (light/dark).
function useS() {
  const C = useColors();
  return useMemo(() => makeS(C), [C]);
}
