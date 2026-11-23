// Λίστα › Ειδοποιήσεις: the products the person watches («Ειδοποίησέ με»),
// each with today's best price and where, and what it is waiting for.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { atChain } from '@shared/list-basket';
import { refreshWatches, removeWatch, useWatches } from '@/lib/alerts';
import type { WatchView } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { formatPrice } from '@/lib/format';
import { Fonts, Radius, Space, useType, type Palette, type TypeScale } from '@/constants/theme';

export function WatchesView() {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const { watches, loaded } = useWatches();
  const [failed, setFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    refreshWatches().then(() => setFailed(false)).catch(() => setFailed(true));
  }, []));

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.brandText} />
      </View>
    );
  }
  if (watches.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Δεν παρακολουθείς κάποιο προϊόν ακόμα</Text>
        <Text style={styles.emptyText}>
          Πάτησε «Ειδοποίησέ με» σε ένα προϊόν για να μαθαίνεις πότε μπαίνει σε προσφορά ή πέφτει η τιμή του.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {failed ? <Text style={styles.note}>Δεν ήρθαν οι σημερινές τιμές. Δείχνουμε τις τελευταίες που ξέρουμε.</Text> : null}
      {watches.map((w) => <WatchRow key={w.id} w={w} />)}
    </ScrollView>
  );
}

function WatchRow({ w }: { w: WatchView }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const chains = useChains();
  const nameOf = (id: string) => chains.find((c) => c.id === id)?.name ?? id;
  const [busy, setBusy] = useState(false);
  const what = [
    w.onOffer ? 'όταν μπει σε προσφορά' : null,
    w.onDrop ? 'όταν πέσει η τιμή' : null,
    w.targetPrice != null ? `όταν φτάσει τα ${formatPrice(w.targetPrice)}` : null,
  ].filter(Boolean).join(', ');
  const open = () => {
    if (w.now?.offerId) router.push(`/offer/${w.now.offerId}`);
    else router.navigate({ pathname: '/search', params: { q: w.name, t: String(Date.now()) } });
  };
  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={open} accessibilityRole="button" accessibilityLabel={`Άνοιξε: ${w.name}`}>
        <Text style={styles.name} numberOfLines={3}>{w.name}</Text>
        {w.now ? (
          <Text style={styles.now}>
            Τώρα {formatPrice(w.now.price)} {atChain(w.now.chain, nameOf(w.now.chain))}
            {w.now.kind === 'offer' ? ' · σε προσφορά' : ''}
          </Text>
        ) : (
          <Text style={styles.nowMuted}>Δεν έχουμε σημερινή τιμή</Text>
        )}
        <Text style={styles.what}>Σε ειδοποιούμε {what}.</Text>
      </Pressable>
      <Pressable
        style={styles.remove}
        disabled={busy}
        onPress={() => { setBusy(true); removeWatch(w.id).catch(() => setBusy(false)); }}
        accessibilityRole="button"
        accessibilityLabel={`Σταμάτα την ειδοποίηση: ${w.name}`}>
        <Text style={styles.removeText}>Διαγραφή</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    content: { padding: Space[4], paddingBottom: Space[6] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space[6] },
    emptyTitle: { ...T.text.h2, color: C.ink, textAlign: 'center' },
    emptyText: { ...T.text.body, color: C.ink2, textAlign: 'center', marginTop: Space[2] },
    note: { ...T.text.secondary, color: C.ink3Text, marginBottom: Space[3] },
    row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.line, marginBottom: Space[3] },
    main: { flex: 1, padding: Space[3], minHeight: 56 },
    name: { ...T.text.title, fontFamily: Fonts.sans700, color: C.ink },
    now: { ...T.text.bodyStrong, color: C.brandText, marginTop: Space[1], fontVariant: ['tabular-nums'] },
    nowMuted: { ...T.text.body, color: C.ink3Text, marginTop: Space[1] },
    what: { ...T.text.secondary, color: C.ink2, marginTop: Space[1] },
    remove: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Space[3], paddingTop: Space[2] },
    removeText: { ...T.text.bodyStrong, color: C.accentText },
  });
