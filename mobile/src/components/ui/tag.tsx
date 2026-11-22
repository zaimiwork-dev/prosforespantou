// A small one-line pill for an honest fact about an offer («Χαμηλότερη τιμή»).
// Green = the app can prove it is a good price; neutral = just information.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Radius, useType, type TypeScale, type Palette } from '@/constants/theme';

export function Tag({ text, tone }: { text: string; tone: 'good' | 'neutral' }) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.pill, tone === 'good' ? styles.good : styles.neutral]}>
      <Text style={[styles.text, { color: tone === 'good' ? C.good : C.ink2 }]} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    // Two lines at most: «Φθηνότερο από 3 άλλα» does not fit one line in a 163 dp
    // card, and an ellipsis would cut the number that makes the claim honest.
    // alignSelf: flex-start keeps the pill as wide as its text; maxWidth lets
    // it shrink (and ellipsise) only when the card is narrower than the text.
    pill: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 2 },
    good: { backgroundColor: C.goodBg },
    neutral: { backgroundColor: C.bgSoft },
    text: { ...T.text.caption, fontFamily: Fonts.sans600 },
  });
