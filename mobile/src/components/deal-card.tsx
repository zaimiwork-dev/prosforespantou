// One offer — the app's version of the website card (src/components/
// DiscountCard.js), laid out per DESIGN.md «Offer card». Every display decision
// except expiry wording arrives precomputed in the DealCard (src/lib/api/
// deal-card.ts on the server); expiry is derived here with the website's own
// expiryInfo because it depends on today and a card can sit in a saved list.
//
// Works at 2-column grid width (~173 dp) and in rails: pass `width` for a rail,
// leave it out in a grid cell (the card fills its parent).
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { expiryInfo } from '@shared/expiry-label';
import type { DealCard as Deal } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { formatPrice, formatUnitPrice } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { addToList, useShoppingList } from '@/lib/shopping-list';

const ADD_SIZE = 48;

export function DealCardView({
  deal,
  width,
  onPress,
  position,
}: {
  deal: Deal;
  width?: number;
  onPress?: (deal: Deal) => void;
  // Slot in the list, sent with the click statistic when the screen knows it.
  position?: number;
}) {
  const T = useType();
  const [imageH, setImageH] = useState(0);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { myChains } = useSettings();
  const chains = useChains();
  const { items } = useShoppingList();
  const chain = chains.find((c) => c.id === deal.chain);
  const added = items.some((i) => i.id === deal.id);
  const exp = useMemo(
    () =>
      expiryInfo({
        validFrom: deal.validFrom,
        validUntil: deal.validUntil,
        updatedAt: deal.updatedAt,
        datesFromSource: deal.datesFromSource,
      }),
    [deal.validFrom, deal.validUntil, deal.updatedAt, deal.datesFromSource],
  );

  // Always the full chain name: the 2-letter `short` codes (ΣΚ, MM) mean
  // nothing to this audience. When badge + name don't fit on one line the
  // strip wraps and the name drops below the badge (styles.strip).
  const chainName = chain?.name ?? deal.chain ?? '';
  // The site's rule: «−N%» when a real old price exists, else the chain's own
  // sticker text («SUPER ΤΙΜΗ», «1+1»), else «ΜΟΝΟ».
  const badge = deal.percent
    ? `−${deal.percent}%`
    : !deal.originalPrice ? (deal.sticker ?? 'ΜΟΝΟ').toLocaleUpperCase('el') : null;
  const struck = deal.originalPrice != null;
  // At most one chip: an urgent expiry beats the staple label.
  const eyebrow =
    exp.chip && exp.urgent
      ? { text: exp.chip, urgent: true }
      : deal.essential?.label
        ? { text: deal.essential.label, urgent: false }
        : null;

  const open = () => {
    track('deal_click', {
      discountId: deal.id,
      supermarket: deal.chain ?? undefined,
      position,
      context: myChains.length ? (deal.chain && myChains.includes(deal.chain) ? 'mine' : 'other') : undefined,
    });
    // Default: open the product page. A screen passes onPress only when a
    // tap should do something else (e.g. pick a card into the list).
    if (onPress) onPress(deal);
    else router.push({ pathname: '/offer/[id]', params: { id: deal.id } });
  };

  return (
    <View style={[styles.card, width ? { width } : null]}>
      {/* The card is several tap areas calling open(), with the «+» as a
          sibling between them: a button nested in a button is invalid on web
          and would also open the product page on native. Only the first area
          is announced to screen readers; the others repeat it. */}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${deal.name}, ${formatPrice(deal.price)}, ${chain?.name ?? deal.chain ?? ''}`}
        style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.imageWrap} onLayout={(e) => setImageH(e.nativeEvent.layout.height)}>
          {deal.imageUrl ? (
            <Image source={{ uri: deal.imageUrl }} style={styles.image} contentFit="contain" transition={150} />
          ) : (
            <View style={[styles.image, styles.noImage]} />
          )}
          <View style={styles.strip} pointerEvents="none">
            {badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.text}>
          {/* The chain gets its own line under the photo: on the photo it
              covered the product, and a pill beside the badge had to be cut. */}
          <View style={styles.chainRow}>
            <View style={[styles.chainDot, { backgroundColor: chain?.color ?? Colors.ink3 }]} />
            <Text style={[styles.chainText, { color: chain?.color ?? Colors.ink2 }]} numberOfLines={1}>
              {chainName}
            </Text>
          </View>
          {eyebrow ? (
            <Text style={[styles.eyebrow, eyebrow.urgent && styles.eyebrowUrgent]} numberOfLines={1}>
              {eyebrow.text}
            </Text>
          ) : null}
          {/* Two lines reserved so prices line up across a grid row. */}
          <Text style={styles.title} numberOfLines={2}>
            {deal.title || deal.name}
          </Text>
          {deal.size ? (
            <Text style={styles.secondary} numberOfLines={1}>
              {deal.size}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable onPress={open} accessible={false} style={styles.priceCol}>
        <Text style={[styles.price, struck && styles.priceSale]} numberOfLines={1}>
          {formatPrice(deal.price)}
        </Text>
        {struck ? <Text style={[styles.secondary, styles.was]}>{formatPrice(deal.originalPrice!)}</Text> : null}
      </Pressable>

      {/* «+» sits on the photo's bottom-right corner (Wolt/Instacart): beside
          the price it no longer fit «11,60 €» in a rail card and wrapped. A
          sibling of the card's Pressable, so a tap never opens the offer. */}
      {imageH > 0 ? (
        <Pressable
          onPress={() => addToList(deal)}
          accessibilityRole="button"
          accessibilityLabel="Προσθήκη στη λίστα"
          accessibilityState={{ selected: added }}
          hitSlop={4}
          style={({ pressed }) => [styles.add, { top: imageH - ADD_SIZE - Space[2] }, added && styles.addDone, pressed && styles.pressed]}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d={added ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 5v14M5 12h14'} />
          </Svg>
        </Pressable>
      ) : null}

      {(!struck && deal.baseline) || deal.unit ? (
        <Pressable onPress={open} accessible={false} style={styles.notes}>
          {!struck && deal.baseline ? <Text style={styles.secondary}>κανονικά ~{formatPrice(deal.baseline.price)}</Text> : null}
          {deal.unit ? (
            <Text style={styles.secondary} numberOfLines={1}>
              {formatUnitPrice(deal.unit)}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.line,
      overflow: 'hidden',
      paddingBottom: Space[3],
    },
    pressed: { opacity: 0.85 },
    imageWrap: { backgroundColor: Colors.surface2, padding: Space[3] },
    image: { width: '100%', aspectRatio: 1 },
    noImage: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md },
    strip: {
      position: 'absolute',
      top: Space[2],
      left: Space[2],
      right: Space[2],
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: 6,
    },
    badge: { flexShrink: 0, backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { ...T.text.badge, color: '#fff' },
    chainRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chainDot: { width: 10, height: 10, borderRadius: 5 },
    chainText: { ...T.text.caption, fontFamily: Fonts.sans700, flexShrink: 1 },
    text: { paddingHorizontal: Space[3], paddingTop: Space[2], gap: 2 },
    eyebrow: { ...T.text.caption, color: Colors.brand },
    eyebrowUrgent: { color: Colors.accent },
    title: { ...T.text.title, color: Colors.ink, minHeight: T.text.title.lineHeight * 2 },
    secondary: { ...T.text.secondary, color: Colors.ink3Text },
    priceCol: { paddingHorizontal: Space[3], marginTop: 4 },
    price: { ...T.text.price, color: Colors.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    priceSale: { color: Colors.accent },
    was: { textDecorationLine: 'line-through' },
    add: {
      position: 'absolute',
      right: Space[2],
      width: ADD_SIZE,
      height: ADD_SIZE,
      borderRadius: ADD_SIZE / 2,
      backgroundColor: Colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      // A white ring keeps it readable on any product photo.
      borderWidth: 2,
      borderColor: Colors.surface,
    },
    addDone: { backgroundColor: Colors.brand2 },
    notes: { paddingHorizontal: Space[3], gap: 2 },
  });
