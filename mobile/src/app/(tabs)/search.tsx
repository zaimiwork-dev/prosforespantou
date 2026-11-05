// Αναζήτηση — GET /api/v1/search, the same search as the website. The server
// ignores accents and final sigma, so the query is sent exactly as typed.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, ApiError, type DealCard } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useChains } from '@/lib/chains';
import { dedupeCards } from '@/lib/lists';
import { clearRecentSearches, rememberSearch, useRecentSearches } from '@/lib/recent-searches';
import { DealCardView } from '@/components/deal-card';
import { Chip } from '@/components/chip';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;
const SUGGESTIONS = ['γάλα', 'καφές', 'ελαιόλαδο', 'φέτα', 'απορρυπαντικό', 'πάνες', 'χαρτί υγείας', 'μπύρα', 'κοτόπουλο', 'ζυμαρικά'];

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function SearchScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [text, setText] = useState('');
  const [chain, setChain] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<DealCard[]>([]);
  const [searched, setSearched] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const recent = useRecentSearches();
  // Set by the favourites list (Λίστα tab) to open a search for a product name.
  const { q: incoming, t: incomingStamp, focus: focusParam } = useLocalSearchParams<{ q?: string; t?: string; focus?: string }>();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // One statistic per completed search (query + filter), not per retry of the same one.
  const lastTracked = useRef('');
  const chains = useChains();
  const { width } = useWindowDimensions();

  const ctrl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The text the latest request was made for; a response for anything else is dropped.
  const current = useRef('');

  useFocusEffect(
    useCallback(() => {
      track('page_view', { page: 'search' });
    }, []),
  );

  // The home screen opens this tab with ?focus=1: put the cursor in the field
  // (keyboard up). The param is cleared so coming back to the tab later by its
  // icon does not pop the keyboard again.
  useFocusEffect(
    useCallback(() => {
      if (focusParam !== '1') return undefined;
      const id = setTimeout(() => {
        input.current?.focus();
        router.setParams({ focus: undefined });
      }, 150);
      return () => clearTimeout(id);
    }, [focusParam]),
  );

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
        const found = dedupeCards(res.deals);
        setResults(found);
        setStatus('done');
        const stamp = `${q}|${chainId ?? ''}`;
        if (lastTracked.current !== stamp) {
          lastTracked.current = stamp;
          track('search', { query: q, resultCount: found.length, supermarket: chainId });
        }
        rememberSearch(q);
      } catch (e) {
        if (c.signal.aborted || current.current !== q) return;
        setErrorStatus(e instanceof ApiError ? e.status : null);
        setStatus('error');
      }
    },
    [cancelPending],
  );

  // Deferred one tick so no state is set synchronously inside the effect.
  useEffect(() => {
    if (!incoming) return;
    const id = setTimeout(() => {
      setText(incoming);
      run(incoming, undefined);
      setChain(undefined);
    }, 0);
    return () => clearTimeout(id);
  }, [incoming, incomingStamp, run]);

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
      <Text style={styles.h1} accessibilityRole="header">Αναζήτηση</Text>
      <View style={styles.field}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.ink3Text} strokeWidth={2.2} strokeLinecap="round" style={styles.glass} pointerEvents="none">
          <Circle cx={11} cy={11} r={7} />
          <Path d="M20 20l-4-4" />
        </Svg>
        <TextInput
          ref={input}
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={() => run(text, chain)}
          placeholder="Τι ψάχνεις; π.χ. γάλα, καφές"
          placeholderTextColor={Colors.ink3Text}
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
          renderItem={({ item, index }) => <DealCardView deal={item} width={cardWidth} position={index} />}
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
                    <View style={styles.recentHead}>
                      <Text style={[styles.h2, styles.h2Gap, styles.recentTitle]}>Πρόσφατες αναζητήσεις</Text>
                      <Pressable
                        onPress={() => clearRecentSearches()}
                        accessibilityRole="button"
                        accessibilityLabel="Καθαρισμός πρόσφατων αναζητήσεων"
                        hitSlop={8}
                        style={styles.clearRecent}>
                        <Text style={styles.clearRecentText}>Καθαρισμός</Text>
                      </Pressable>
                    </View>
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

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { padding: Space[4], paddingBottom: Space[7] },
    h1: { ...T.text.hero, color: Colors.ink, marginBottom: Space[3] },
    field: { justifyContent: 'center' },
    glass: { position: 'absolute', left: Space[4], zIndex: 1 },
    input: {
      minHeight: 56,
      ...T.text.body,
      fontSize: T.bodyLg,
      color: Colors.ink,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.line2,
      borderRadius: Radius.pill,
      paddingLeft: 52,
      paddingRight: 52,
    },
    clear: { position: 'absolute', right: 4, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    clearText: { ...T.text.h2, fontFamily: Fonts.sans500, color: Colors.ink2 },
    chainsRow: { marginHorizontal: -Space[4], marginVertical: Space[3], flexGrow: 0 },
    chains: { paddingHorizontal: Space[4], gap: Space[2] },
    h2: { ...T.text.h2, color: Colors.ink, marginTop: Space[3], marginBottom: Space[3] },
    h2Gap: { marginTop: Space[6] },
    recentHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    recentTitle: { flexShrink: 1 },
    clearRecent: { minHeight: 44, justifyContent: 'center', paddingLeft: Space[3] },
    clearRecentText: { ...T.text.bodyStrong, color: Colors.brand },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
    count: { ...T.text.secondary, color: Colors.ink3Text, marginBottom: Space[3] },
    state: { alignItems: 'center', paddingVertical: Space[7] },
    stateText: { ...T.text.body, color: Colors.ink2, textAlign: 'center' },
    retry: { marginTop: Space[5], minHeight: 52, justifyContent: 'center', backgroundColor: Colors.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6] },
    retryText: { ...T.text.button, color: '#fff' },
  });
