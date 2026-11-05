// Ρυθμίσεις — everything here lives on the device (no login): text size,
// the shopper's stores and the usage-statistics choice.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from '@/lib/api';
import { setConsentChoice } from '@/lib/analytics';
import { updateSettings, useSettings } from '@/lib/settings';
import { ChainTile, TileGrid } from '@/components/chain-tile';
import { useChainList } from '@/components/filters/use-chain-list';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';

// Two equal pill buttons, one selected. 52 high for thumbs and older eyes.
function Choice({ options, value, onChange, T, column = false }: { column?: boolean; options: { id: string; label: string }[]; value: string | null; onChange: (id: string) => void; T: TypeScale }) {
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
            <Text style={[T.text.button, { color: on ? '#fff' : Colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const choiceStyles = StyleSheet.create({
  btn: { flex: 1, minHeight: 52, paddingHorizontal: Space[3], borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: Colors.brand, borderColor: Colors.brand },
});

export default function SettingsScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { textSize, myChains, consent } = useSettings();
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
        <Text style={styles.h2}>Τα καταστήματά μου</Text>
        <Text style={styles.text}>Οι προσφορές τους εμφανίζονται πρώτες στο tab «Προσφορές».</Text>
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

      <Text style={styles.version}>Έκδοση εφαρμογής {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { padding: Space[4], gap: Space[4], paddingBottom: Space[7] },
    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Space[4], gap: Space[3] },
    h2: { ...T.text.h2, color: Colors.ink },
    text: { ...T.text.body, color: Colors.ink2 },
    muted: { ...T.text.caption, color: Colors.ink3Text },
    preview: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md, padding: Space[3] },
    previewText: { ...T.text.title, color: Colors.ink },
    errorBox: { gap: Space[3], alignItems: 'flex-start' },
    retry: { minHeight: 52, paddingHorizontal: Space[6], borderRadius: Radius.pill, backgroundColor: Colors.brand, justifyContent: 'center' },
    link: { minHeight: 48, justifyContent: 'center' },
    linkText: { ...T.text.bodyStrong, color: Colors.brand, textDecorationLine: 'underline' },
    version: { ...T.text.caption, color: Colors.ink3Text, textAlign: 'center', fontFamily: Fonts.sans500 },
  });
