// One offer — the app's version of the website card (src/components/
// DiscountCard.js), laid out per DESIGN.md «Offer card». Every display decision
// except expiry wording arrives precomputed in the DealCard (src/lib/api/
// deal-card.ts on the server); expiry is derived here with the website's own
// expiryInfo because it depends on today and a card can sit in a saved list.
//
// Works at 2-column grid width (~173 dp) and in rails: pass `width` for a rail,
// leave it out in a grid cell (the card fills its parent).
import { useMemo } from 'react';
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
// Longer chain names would be cut off next to the discount badge in a 173 dp
// card, so the chain's `short` name is shown instead.
const LONG_CHAIN_NAME = 8;

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
  const styles = useMemo(() => makeStyles(T), [T]);
  const { myChains, textSize } = useSettings();
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

  const chainName = chain ? (chain.name.length > (textSize === 'large' ? 5 : LONG_CHAIN_NAME) ? chain.short : chain.name) : (deal.chain ?? '');
  // The site's rule: «−N%» when a real old price exists, else «ΜΟΝΟ». The site
  // also prints the chain's own sticker text (`description`, e.g. «SUPER ΤΙΜΗ»,
  // «1+1») instead of ΜΟΝΟ; the API does not send it, so the app can only show
  // ΜΟΝΟ until the DealCard contract gains that field.
  const badge = deal.percent ? `−${deal.percent}%` : !deal.originalPrice ? 'ΜΟΝΟ' : null;
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
        <View style={styles.imageWrap}>
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
            <View style={styles.chainPill}>
              <Text style={[styles.chainText, { color: chain?.color ?? Colors.ink2 }]} numberOfLines={1}>
                {chainName}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.text}>
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

      <View style={styles.priceRow}>
        <Pressable onPress={open} accessible={false} style={styles.priceCol}>
          <Text style={[styles.price, struck && styles.priceSale]}>
            {formatPrice(deal.price)}
          </Text>
          {struck ? <Text style={[styles.secondary, styles.was]}>{formatPrice(deal.originalPrice!)}</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => addToList(deal)}
          accessibilityRole="button"
          accessibilityLabel="Προσθήκη στη λίστα"
          accessibilityState={{ selected: added }}
          hitSlop={4}
          style={({ pressed }) => [styles.add, added && styles.addDone, pressed && styles.pressed]}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d={added ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 5v14M5 12h14'} />
          </Svg>
        </Pressable>
      </View>

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
      alignItems: 'flex-start',
      gap: 6,
    },
    badge: { flexShrink: 0, backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { ...T.text.badge, color: '#fff' },
    chainPill: {
      marginLeft: 'auto',
      flexShrink: 1,
      minWidth: 0,
      backgroundColor: Colors.surface,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: Colors.line,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    chainText: { ...T.text.caption, fontFamily: Fonts.sans700 },
    text: { paddingHorizontal: Space[3], paddingTop: Space[2], gap: 2 },
    eyebrow: { ...T.text.caption, color: Colors.brand },
    eyebrowUrgent: { color: Colors.accent },
    title: { ...T.text.title, color: Colors.ink, minHeight: T.text.title.lineHeight * 2 },
    secondary: { ...T.text.secondary, color: Colors.ink3Text },
    priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingLeft: Space[3], paddingRight: Space[2], marginTop: 4 },
    priceCol: { flexGrow: 1, flexShrink: 0, justifyContent: 'center', minHeight: ADD_SIZE },
    price: { ...T.text.price, color: Colors.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    priceSale: { color: Colors.accent },
    was: { textDecorationLine: 'line-through' },
    add: {
      // Wraps under the price (right-aligned) when large text leaves no room beside it.
      marginLeft: 'auto',
      width: ADD_SIZE,
      height: ADD_SIZE,
      borderRadius: ADD_SIZE / 2,
      backgroundColor: Colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addDone: { backgroundColor: Colors.brand2 },
    notes: { paddingHorizontal: Space[3], gap: 2 },
  });
