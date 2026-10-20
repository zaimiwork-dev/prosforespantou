// Αρχική — the website homepage's three rails (src/app/page.tsx +
// HomeClient), from GET /api/v1/home: the week's staples at their cheapest,
// the top offers, and offers ending soon.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type DealCard, type HomeResponse } from '@/lib/api';
import { dedupeCards } from '@/lib/lists';
import { DealCardView } from '@/components/deal-card';
import { Colors, Radius, Space, Type } from '@/constants/theme';

export default function HomeScreen() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

  const apply = useCallback((home: HomeResponse) => {
    setData({ ...home, top: dedupeCards(home.top), endingSoon: dedupeCards(home.endingSoon) });
  }, []);

  // Retry and pull-to-refresh (event handlers, so resetting the error first
  // is fine there).
  const load = useCallback(async () => {
    try {
      setError(false);
      apply(await api.home());
    } catch {
      setError(true);
    }
  }, [apply]);

  // First load: state changes only when the request settles, and not at all
  // if the screen unmounted meanwhile.
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .home(ctrl.signal)
      .then(apply)
      .catch(() => {
        if (!ctrl.signal.aborted) setError(true);
      });
    return () => ctrl.abort();
  }, [apply]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!data && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Δεν φορτώθηκαν οι προσφορές</Text>
        <Text style={styles.errorText}>Έλεγξε τη σύνδεσή σου στο ίντερνετ.</Text>
        <Pressable style={styles.retry} onPress={load} accessibilityRole="button">
          <Text style={styles.retryText}>Δοκίμασε ξανά</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Two columns with the screen's side gutters and one gap between them.
  const gridCard = (width - Space[4] * 2 - Space[3]) / 2;
  const railCard = Math.min(170, width * 0.42);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
        <Text style={styles.h1}>Προσφορές Παντού</Text>
        <Text style={styles.sub}>{data.total.toLocaleString('el-GR')} προσφορές σε 7 σούπερ μάρκετ</Text>

        <Rail title="Τα βασικά της εβδομάδας" hint="Στη χαμηλότερη τιμή τους" deals={data.essentials} cardWidth={railCard} />

        <Text style={styles.h2}>Κορυφαίες προσφορές</Text>
        <View style={styles.grid}>
          {data.top.map((d) => (
            <DealCardView key={d.id} deal={d} width={gridCard} />
          ))}
        </View>

        <Rail title="Λήγουν σύντομα" deals={data.endingSoon} cardWidth={railCard} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Rail({ title, hint, deals, cardWidth }: { title: string; hint?: string; deals: DealCard[]; cardWidth: number }) {
  if (deals.length === 0) return null;
  return (
    <View style={styles.rail}>
      <Text style={styles.h2}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <FlatList
        horizontal
        data={deals}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => <DealCardView deal={item} width={cardWidth} />}
        ItemSeparatorComponent={() => <View style={{ width: Space[3] }} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Space[4] }}
        style={{ marginHorizontal: -Space[4] }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Space[4], paddingBottom: Space[7] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Space[6] },
  h1: { fontSize: Type.h1, fontWeight: '800', color: Colors.brand },
  sub: { fontSize: Type.body, color: Colors.ink2, marginTop: 2, marginBottom: Space[5] },
  h2: { fontSize: Type.h2, fontWeight: '800', color: Colors.ink, marginBottom: Space[2] },
  hint: { fontSize: Type.caption, color: Colors.ink3, marginTop: -Space[1], marginBottom: Space[2] },
  rail: { marginBottom: Space[6] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[3], marginBottom: Space[6] },
  errorTitle: { fontSize: Type.title, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  errorText: { fontSize: Type.body, color: Colors.ink2, marginTop: Space[2], textAlign: 'center' },
  retry: { marginTop: Space[5], backgroundColor: Colors.brand, borderRadius: Radius.md, paddingHorizontal: Space[6], paddingVertical: Space[3] },
  retryText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '700' },
});
