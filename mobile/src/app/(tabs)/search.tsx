// Αναζήτηση — three moments on one screen:
//   idle     recents, popular searches, «Ανά διάδρομο» (department tiles)
//   typing   suggestions under the field (GET /api/v1/suggest, debounced);
//            search runs on the keyboard's «search» key or a tapped suggestion
//   results  GET /api/v1/search (the website's search; the server ignores
//            accents and final sigma, so the text is sent as typed), narrowed
//            and sorted on the phone with facets built from the results
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, ApiError, type DealCard, type SuggestResponse } from '@/lib/api';
import { track } from '@/lib/analytics';
import { useChains, useMeta } from '@/lib/chains';
import { useImpressionTracker } from '@/lib/impressions';
import { noteInterest } from '@/lib/interest';
import { dedupeCards } from '@/lib/lists';
import { clearRecentSearches, rememberSearch, useRecentSearches } from '@/lib/recent-searches';
import { DealCardView } from '@/components/deal-card';
import { Chip } from '@/components/chip';
import { GridSkeleton } from '@/components/ui/skeleton';
import { AisleGrid } from '@/components/search/aisle-grid';
import { ResultBar } from '@/components/search/result-bar';
import { SuggestionList } from '@/components/search/suggestion-list';
import {
  NO_SELECTION,
  applyFacets,
  chainFacets,
  departmentFacets,
  hasSelection,
  sortDeals,
  toggle,
  type Selection,
  type SortKey,
} from '@/components/search/search-model';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

const MIN_CHARS = 2;
const SUGGEST_DEBOUNCE_MS = 150;
const SUGGESTIONS = ['γάλα', 'καφές', 'ελαιόλαδο', 'φέτα', 'απορρυπαντικό', 'πάνες', 'χαρτί υγείας', 'μπύρα', 'κοτόπουλο', 'ζυμαρικά'];

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function SearchScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<DealCard[]>([]);
  const [searched, setSearched] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [sel, setSel] = useState<Selection>(NO_SELECTION);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sugg, setSugg] = useState<SuggestResponse | null>(null);
  const recent = useRecentSearches();
  // Set by the favourites list (Λίστα tab) to open a search for a product name.
  const { q: incoming, t: incomingStamp, focus: focusParam } = useLocalSearchParams<{ q?: string; t?: string; focus?: string }>();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // One statistic per completed search, not per retry of the same one.
  const lastTracked = useRef('');
  const chains = useChains();
  const { meta } = useMeta();
  const impressions = useImpressionTracker('search');
  const { width } = useWindowDimensions();

  const ctrl = useRef<AbortController | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestCtrl = useRef<AbortController | null>(null);
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

  const cancelSuggest = useCallback(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = null;
    suggestCtrl.current?.abort();
    suggestCtrl.current = null;
  }, []);

  const cancelSearch = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelSuggest();
      cancelSearch();
    },
    [cancelSuggest, cancelSearch],
  );

  const run = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      cancelSuggest();
      cancelSearch();
      if (q.length < MIN_CHARS) {
        current.current = '';
        setStatus('idle');
        return;
      }
      Keyboard.dismiss();
      const c = new AbortController();
      ctrl.current = c;
      current.current = q;
      setStatus('loading');
      setSearched(q);
      setSugg(null);
      setSel(NO_SELECTION);
      setSort('relevance');
      try {
        const res = await api.search(q, undefined, c.signal);
        if (c.signal.aborted || current.current !== q) return;
        const found = dedupeCards(res.deals);
        setResults(found);
        setStatus('done');
        if (lastTracked.current !== q) {
          lastTracked.current = q;
          track('search', { query: q, resultCount: found.length });
        }
        rememberSearch(q);
      } catch (e) {
        if (c.signal.aborted || current.current !== q) return;
        setErrorStatus(e instanceof ApiError ? e.status : null);
        setStatus('error');
      }
    },
    [cancelSuggest, cancelSearch],
  );

  // Deferred one tick so no state is set synchronously inside the effect.
  useEffect(() => {
    if (!incoming) return;
    const id = setTimeout(() => {
      setText(incoming);
      run(incoming);
    }, 0);
    return () => clearTimeout(id);
  }, [incoming, incomingStamp, run]);

  const onChangeText = (value: string) => {
    setText(value);
    cancelSuggest();
    // Editing leaves the results: a search in flight is no longer wanted.
    cancelSearch();
    current.current = '';
    setStatus((s) => (s === 'loading' ? 'idle' : s));
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setStatus('idle');
      setSugg(null);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      const c = new AbortController();
      suggestCtrl.current = c;
      try {
        const res = await api.suggest(q, c.signal);
        if (!c.signal.aborted) setSugg(res);
      } catch {
        // No suggestions is not an error: the «Αναζήτηση για …» row still works.
        if (!c.signal.aborted) setSugg(null);
      }
    }, SUGGEST_DEBOUNCE_MS);
  };

  const pick = (value: string) => {
    setText(value);
    run(value);
  };

  const openAisle = (id: string) => {
    noteInterest('filter', { category: id });
    router.navigate({ pathname: '/deals', params: { category: id } });
  };

  const clear = () => {
    setText('');
    cancelSuggest();
    cancelSearch();
    current.current = '';
    setSugg(null);
    setStatus('idle');
  };

  const typedQ = text.trim();
  const typing = typedQ.length >= MIN_CHARS && typedQ !== searched;
  const showResults = !typing && status !== 'idle';
  const done = showResults && status === 'done';

  const chainFacetList = useMemo(() => chainFacets(results), [results]);
  const deptFacetList = useMemo(() => departmentFacets(results, 4), [results]);
  const view = useMemo(() => sortDeals(applyFacets(results, sel), sort), [results, sel, sort]);

  const chainOf = (id: string) => chains.find((c) => c.id === id);
  const categoryLabel = (id: string) => meta?.categories.find((c) => c.id === id)?.label ?? id;

  const cardWidth = (width - Space[4] * 2 - Space[3]) / 2;
  const aisles = <AisleGrid categories={meta?.categories} onPick={(c) => openAisle(c.id)} />;

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
          onSubmitEditing={() => run(text)}
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
      {done && results.length > 0 ? (
        <View style={styles.resultsHead}>
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {view.length === results.length
              ? `${results.length.toLocaleString('el-GR')} ${results.length === 1 ? 'αποτέλεσμα' : 'αποτελέσματα'} για «${searched}»`
              : `${view.length.toLocaleString('el-GR')} από ${results.length.toLocaleString('el-GR')} αποτελέσματα για «${searched}»`}
          </Text>
          <ResultBar
            chains={chainFacetList}
            departments={deptFacetList}
            chainName={(id) => chainOf(id)?.name ?? id}
            chainColor={(id) => chainOf(id)?.color}
            departmentLabel={categoryLabel}
            selected={sel}
            onToggleChain={(id) => setSel((s) => ({ ...s, chains: toggle(s.chains, id) }))}
            onToggleDepartment={(id) => setSel((s) => ({ ...s, categories: toggle(s.categories, id) }))}
            onClear={() => setSel(NO_SELECTION)}
            sort={sort}
            onSort={setSort}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={done ? view : []}
        keyExtractor={(d) => d.id}
        numColumns={2}
        renderItem={({ item, index }) => <DealCardView deal={item} width={cardWidth} position={index} />}
        columnWrapperStyle={{ gap: Space[3] }}
        ItemSeparatorComponent={() => <View style={{ height: Space[3] }} />}
        viewabilityConfig={impressions.viewabilityConfig}
        onViewableItemsChanged={impressions.onViewableItemsChanged}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={
          typing ? (
            <SuggestionList
              typed={typedQ}
              data={sugg}
              onSearch={() => run(text)}
              onTerm={pick}
              onCategory={(c) => openAisle(c.id)}
            />
          ) : status === 'idle' ? (
            <View>
              {recent.length > 0 ? (
                <>
                  <View style={styles.recentHead}>
                    <Text style={[styles.h2, styles.recentTitle]}>Πρόσφατες αναζητήσεις</Text>
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
              <Text style={[styles.h2, recent.length > 0 && styles.h2Gap]}>Δημοφιλείς αναζητήσεις</Text>
              <View style={styles.wrap}>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onPress={() => pick(s)} />
                ))}
              </View>
              {aisles}
            </View>
          ) : status === 'loading' ? (
            <View style={styles.skeleton}>
              <GridSkeleton rows={3} />
            </View>
          ) : status === 'error' ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>
                {errorStatus === 429
                  ? 'Πολλές αναζητήσεις μαζί. Δοκίμασε ξανά σε λίγο.'
                  : 'Δεν ολοκληρώθηκε η αναζήτηση. Έλεγξε τη σύνδεσή σου.'}
              </Text>
              <Pressable style={styles.retry} onPress={() => run(searched)} accessibilityRole="button">
                <Text style={styles.retryText}>Δοκίμασε ξανά</Text>
              </Pressable>
            </View>
          ) : results.length === 0 ? (
            <View>
              <View style={styles.state}>
                <Text style={styles.stateText}>Δεν βρήκαμε «{searched}». Δοκίμασε μια πιο γενική λέξη.</Text>
              </View>
              <AisleGrid categories={meta?.categories} onPick={(c) => openAisle(c.id)} title="Ή ψάξε ανά διάδρομο" />
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateText}>Κανένα αποτέλεσμα με αυτά τα φίλτρα.</Text>
              {hasSelection(sel) ? (
                <Pressable style={styles.retry} onPress={() => setSel(NO_SELECTION)} accessibilityRole="button">
                  <Text style={styles.retryText}>Καθαρισμός φίλτρων</Text>
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
    resultsHead: { marginTop: Space[3] },
    h2: { ...T.text.h2, color: Colors.ink, marginTop: Space[4], marginBottom: Space[3] },
    h2Gap: { marginTop: Space[6] },
    recentHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    recentTitle: { flexShrink: 1 },
    clearRecent: { minHeight: 44, justifyContent: 'center', paddingLeft: Space[3] },
    clearRecentText: { ...T.text.bodyStrong, color: Colors.brand },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
    count: { ...T.text.secondary, color: Colors.ink3Text, marginBottom: Space[3] },
    skeleton: { marginHorizontal: -Space[4], marginTop: Space[3] },
    state: { alignItems: 'center', paddingVertical: Space[6] },
    stateText: { ...T.text.body, color: Colors.ink2, textAlign: 'center' },
    retry: { marginTop: Space[5], minHeight: 52, justifyContent: 'center', backgroundColor: Colors.brand, borderRadius: Radius.pill, paddingHorizontal: Space[6] },
    retryText: { ...T.text.button, color: '#fff' },
  });
