// Ρυθμίσεις — everything here lives on the device (no login): text size,
// the shopper's stores and the usage-statistics choice.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from '@/lib/api';
import { setConsentChoice } from '@/lib/analytics';
import { clearRecentlyViewed } from '@/lib/recently-viewed';
import { updateSettings, useSettings } from '@/lib/settings';
import { showToast } from '@/components/ui/toast';
import { ChainTile, TileGrid } from '@/components/chain-tile';
import { useChainList } from '@/components/filters/use-chain-list';
import { Fonts, Radius, Space, useType, type TypeScale, type Palette, useColors } from '@/constants/theme';

// Two equal pill buttons, one selected. 52 high for thumbs and older eyes.
function Choice({ options, value, onChange, T, column = false }: { column?: boolean; options: { id: string; label: string }[]; value: string | null; onChange: (id: string) => void; T: TypeScale }) {
  const choiceStyles = useChoiceStyles();
  const C = useColors();
  return (
    <View style={{ flexDirection: column ? 'column' : 'row', gap: Space[2] }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[choiceStyles.btn, on && choiceStyles.on]}>
            <Text style={[T.text.button, { color: on ? '#fff' : C.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const makeChoiceStyles = (C: Palette) => StyleSheet.create({
  btn: { flex: 1, minHeight: 52, paddingHorizontal: Space[3], borderRadius: Radius.pill, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: C.brand, borderColor: C.brand },
});

export default function SettingsScreen() {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const { textSize, myChains, consent, appearance } = useSettings();
  const { chains, failed, retry } = useChainList();

  const toggleChain = (id: string) =>
    updateSettings({ myChains: myChains.includes(id) ? myChains.filter((c) => c !== id) : [...myChains, id] });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.h2}>Μέγεθος γραμμάτων</Text>
        <Choice
          T={T}
          column
          value={textSize}
          onChange={(id) => updateSettings({ textSize: id === 'large' ? 'large' : 'normal' })}
          options={[
            { id: 'normal', label: 'Κανονικά' },
            { id: 'large', label: 'Μεγάλα γράμματα' },
          ]}
        />
        <View style={styles.preview}>
          <Text style={styles.previewText}>Γάλα πλήρες 1L</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Εμφάνιση</Text>
        <Text style={styles.text}>Η σκοτεινή εμφάνιση κουράζει λιγότερο τα μάτια το βράδυ.</Text>
        <Choice
          T={T}
          column
          value={appearance}
          onChange={(id) => updateSettings({ appearance: id === 'light' || id === 'dark' ? id : 'system' })}
          options={[
            { id: 'system', label: 'Όπως το κινητό' },
            { id: 'light', label: 'Φωτεινή' },
            { id: 'dark', label: 'Σκοτεινή' },
          ]}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Τα καταστήματά μου</Text>
        <Text style={styles.text}>Οι προσφορές τους εμφανίζονται πρώτες στην καρτέλα «Προσφορές».</Text>
        {chains.length > 0 ? (
          <TileGrid>
            {chains.map((c) => (
              <ChainTile key={c.id} chain={c} selected={myChains.includes(c.id)} onPress={() => toggleChain(c.id)} />
            ))}
          </TileGrid>
        ) : failed ? (
          <View style={styles.errorBox}>
            <Text style={styles.text}>Δεν φορτώθηκαν τα καταστήματα.</Text>
            {retry ? (
              <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}>
                <Text style={[T.text.button, { color: '#fff' }]}>Δοκίμασε ξανά</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.muted}>Φόρτωση καταστημάτων…</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Στατιστικά χρήσης</Text>
        <Text style={styles.text}>
          Μετράμε ανώνυμα ποιες προσφορές πατιούνται, για να βελτιώνουμε την εφαρμογή. Δεν ζητάμε όνομα, email ή τοποθεσία.
        </Text>
        <Choice
          T={T}
          value={consent === 'accepted' ? 'accepted' : consent === 'rejected' ? 'rejected' : null}
          onChange={(id) => setConsentChoice(id === 'accepted' ? 'accepted' : 'rejected', 'settings')}
          options={[
            { id: 'accepted', label: 'Αποδοχή' },
            { id: 'rejected', label: 'Απόρριψη' },
          ]}
        />
        <Text style={styles.muted}>
          {consent === 'accepted' ? 'Τώρα: αποδεκτά' : consent === 'rejected' ? 'Τώρα: απορρίφθηκαν' : 'Δεν έχεις επιλέξει ακόμη — δεν στέλνουμε τίποτα.'}
        </Text>
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/aporrito`)}
          accessibilityRole="link"
          accessibilityLabel="Πολιτική απορρήτου"
          style={styles.link}>
          <Text style={styles.linkText}>Πολιτική απορρήτου</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Ιστορικό</Text>
        <Pressable
          onPress={() => {
            void clearRecentlyViewed();
            showToast({ message: 'Το ιστορικό προβολών καθαρίστηκε' });
          }}
          accessibilityRole="button"
          style={styles.clear}>
          <Text style={[T.text.button, { color: C.ink }]}>Καθαρισμός ιστορικού προβολών</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>Έκδοση εφαρμογής {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: Space[4], gap: Space[4], paddingBottom: Space[7] },
    card: { backgroundColor: C.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.line, padding: Space[4], gap: Space[3] },
    h2: { ...T.text.h2, color: C.ink },
    text: { ...T.text.body, color: C.ink2 },
    muted: { ...T.text.caption, color: C.ink3Text },
    preview: { backgroundColor: C.bgSoft, borderRadius: Radius.md, padding: Space[3] },
    previewText: { ...T.text.title, color: C.ink },
    errorBox: { gap: Space[3], alignItems: 'flex-start' },
    retry: { minHeight: 52, paddingHorizontal: Space[6], borderRadius: Radius.pill, backgroundColor: C.brand, justifyContent: 'center' },
    clear: { minHeight: 52, paddingHorizontal: Space[3], borderRadius: Radius.pill, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    link: { minHeight: 48, justifyContent: 'center' },
    linkText: { ...T.text.bodyStrong, color: C.brandText, textDecorationLine: 'underline' },
    version: { ...T.text.caption, color: C.ink3Text, textAlign: 'center', fontFamily: Fonts.sans500 },
  });

// Rebuilt when the palette changes (light/dark).
function useChoiceStyles() {
  const C = useColors();
  return useMemo(() => makeChoiceStyles(C), [C]);
}
