// Αναζήτηση — GET /api/v1/search, the same search as the website. The server
// ignores accents and final sigma, so the query is sent exactly as typed.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type DealCard } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { dedupeCards } from '@/lib/lists';
import { DealCardView } from '@/components/deal-card';
import { Chip } from '@/components/chip';
import { Colors, Radius, Space, Type } from '@/constants/theme';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;
const SUGGESTIONS = ['γάλα', 'καφές', 'ελαιόλαδο', 'φέτα', 'απορρυπαντικό', 'πάνες', 'χαρτί υγείας', 'μπύρα', 'κοτόπουλο', 'ζυμαρικά'];

// Recent searches live in memory for this app session only; persisting them
// across launches comes in week 3 together with the other saved settings.
let recentSearches: string[] = [];
function rememberSearch(text: string) {
  recentSearches = [text, ...recentSearches.filter((r) => r !== text)].slice(0, 6);
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function SearchScreen() {
  const [text, setText] = useState('');
  const [chain, setChain] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<DealCard[]>([]);
  const [searched, setSearched] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [recent, setRecent] = useState<string[]>(recentSearches);
  const chains = useChains();
  const { width } = useWindowDimensions();

  const ctrl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The text the latest request was made for; a response for anything else is dropped.
  const current = useRef('');

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const run = useCallback(
    async (raw: string, chainId: string | undefined) => {
      const q = raw.trim();
      cancelPending();
      if (q.length < MIN_CHARS) {
        current.current = '';
        setStatus('idle');
        return;
      }
      const c = new AbortController();
      ctrl.current = c;
      current.current = q;
      setStatus('loading');
      setSearched(q);
      try {
        const res = await api.search(q, chainId, c.signal);
        if (c.signal.aborted || current.current !== q) return;
        setResults(dedupeCards(res.deals));
        setStatus('done');
        rememberSearch(q);
        setRecent(recentSearches);
      } catch (e) {
        if (c.signal.aborted || current.current !== q) return;
        setErrorStatus(e instanceof ApiError ? e.status : null);
        setStatus('error');
      }
    },
    [cancelPending],
  );

  const onChangeText = (value: string) => {
    setText(value);
    cancelPending();
    if (value.trim().length < MIN_CHARS) {
      current.current = '';
      setStatus('idle');
      return;
    }
    timer.current = setTimeout(() => run(value, chain), DEBOUNCE_MS);
  };

  const pick = (value: string) => {
    setText(value);
    run(value, chain);
  };

  const pickChain = (id: string | undefined) => {
    setChain(id);
    if (text.trim().length >= MIN_CHARS) run(text, id);
  };

  const clear = () => {
    setText('');
    cancelPending();
    current.current = '';
    setStatus('idle');
  };

  const cardWidth = (width - Space[4] * 2 - Space[3]) / 2;

  const header = (
    <View>
      <Text style={styles.h1}>Αναζήτηση</Text>
      <View style={styles.field}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={() => run(text, chain)}
          placeholder="Τι ψάχνεις; π.χ. γάλα, καφές"
          placeholderTextColor={Colors.ink3}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Αναζήτηση προϊόντος"
          style={styles.input}
        />
        {text.length > 0 ? (
          <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Καθαρισμός" hitSlop={8} style={styles.clear}>
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chainsRow} contentContainerStyle={styles.chains}>
        <Chip label="Όλα" selected={chain === undefined} onPress={() => pickChain(undefined)} />
        {chains.map((c) => (
          <Chip key={c.id} label={c.name} color={c.color} selected={chain === c.id} onPress={() => pickChain(c.id)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
        <FlatList
          data={status === 'done' ? results : []}
          keyExtractor={(d) => d.id}
          numColumns={2}
          renderItem={({ item }) => <DealCardView deal={item} width={cardWidth} />}
          columnWrapperStyle={{ gap: Space[3] }}
          ItemSeparatorComponent={() => <View style={{ height: Space[3] }} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              {header}
              {status === 'done' && results.length > 0 ? (
                <Text style={styles.count}>
                  {results.length.toLocaleString('el-GR')} {results.length === 1 ? 'αποτέλεσμα' : 'αποτελέσματα'} για «{searched}»
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            status === 'idle' ? (
              <View>
                <Text style={styles.h2}>Δημοφιλείς αναζητήσεις</Text>
                <View style={styles.wrap}>
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s} label={s} onPress={() => pick(s)} />
                  ))}
                </View>
                {recent.length > 0 ? (
                  <>
                    <Text style={[styles.h2, styles.h2Gap]}>Πρόσφατες αναζητήσεις</Text>
                    <View style={styles.wrap}>
                      {recent.map((r) => (
                        <Chip key={r} label={r} onPress={() => pick(r)} />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : status === 'loading' ? (
              <View style={styles.state}>
                <ActivityIndicator size="large" color={Colors.brand} />
              </View>
            ) : status === 'error' ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>
                  {errorStatus === 429
                    ? 'Πολλές αναζητήσεις μαζί. Δοκίμασε ξανά σε λίγο.'
                    : 'Δεν ολοκληρώθηκε η αναζήτηση. Έλεγξε τη σύνδεσή σου.'}
                </Text>
                <Pressable style={styles.retry} onPress={() => run(text, chain)} accessibilityRole="button">
                  <Text style={styles.retryText}>Δοκίμασε ξανά</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.state}>
                <Text style={styles.stateText}>Δεν βρήκαμε «{searched}». Δοκίμασε μια πιο γενική λέξη.</Text>
                {chain ? (
                  <Pressable style={styles.retry} onPress={() => pickChain(undefined)} accessibilityRole="button">
                    <Text style={styles.retryText}>Αναζήτηση σε όλα</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Space[4], paddingBottom: Space[7] },
  h1: { fontSize: Type.h1, fontWeight: '800', color: Colors.brand, marginBottom: Space[3] },
  field: { justifyContent: 'center' },
  input: {
    minHeight: 52,
    fontSize: Type.bodyLg,
    color: Colors.ink,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line2,
    borderRadius: Radius.md,
    paddingLeft: Space[4],
    paddingRight: 52,
  },
  clear: { position: 'absolute', right: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: Type.title, color: Colors.ink2 },
  chainsRow: { marginHorizontal: -Space[4], marginVertical: Space[3], flexGrow: 0 },
  chains: { paddingHorizontal: Space[4], gap: Space[2] },
  h2: { fontSize: Type.h2, fontWeight: '800', color: Colors.ink, marginTop: Space[3], marginBottom: Space[3] },
  h2Gap: { marginTop: Space[6] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
  count: { fontSize: Type.body, color: Colors.ink2, marginBottom: Space[3] },
  state: { alignItems: 'center', paddingVertical: Space[7] },
  stateText: { fontSize: Type.bodyLg, color: Colors.ink2, textAlign: 'center' },
  retry: { marginTop: Space[5], backgroundColor: Colors.brand, borderRadius: Radius.md, paddingHorizontal: Space[6], paddingVertical: Space[3] },
  retryText: { color: '#fff', fontSize: Type.bodyLg, fontWeight: '700' },
});
