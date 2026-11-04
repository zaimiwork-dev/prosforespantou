// Ρυθμίσεις — everything here lives on the device (no login): text size,
// the shopper's stores and the usage-statistics choice.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from '@/lib/api';
import { useChains } from '@/lib/chains';
import { setConsentChoice } from '@/lib/analytics';
import { updateSettings, useSettings } from '@/lib/settings';
import { Chip } from '@/components/chip';
import { Colors, Radius, Space, useType, type TypeScale } from '@/constants/theme';

export default function SettingsScreen() {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { textSize, myChains, consent } = useSettings();
  const chains = useChains();

  const toggleChain = (id: string) =>
    updateSettings({ myChains: myChains.includes(id) ? myChains.filter((c) => c !== id) : [...myChains, id] });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.h2}>Μέγεθος γραμμάτων</Text>
        <View style={styles.row}>
          <Chip label="Κανονικά" selected={textSize === 'normal'} onPress={() => updateSettings({ textSize: 'normal' })} />
          <Chip label="Μεγάλα" selected={textSize === 'large'} onPress={() => updateSettings({ textSize: 'large' })} />
        </View>
        <View style={styles.preview}>
          <Text style={styles.previewText}>Γάλα πλήρες 1L — 1,29€</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Τα καταστήματά μου</Text>
        <Text style={styles.text}>Οι προσφορές τους εμφανίζονται πρώτες στο tab «Προσφορές».</Text>
        {chains.length === 0 ? (
          <Text style={styles.muted}>Φόρτωση καταστημάτων…</Text>
        ) : (
          <View style={styles.wrap}>
            {chains.map((c) => (
              <Chip key={c.id} label={c.name} color={c.color} selected={myChains.includes(c.id)} onPress={() => toggleChain(c.id)} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Στατιστικά χρήσης</Text>
        <Text style={styles.text}>
          Μετράμε ανώνυμα ποιες προσφορές πατιούνται, για να βελτιώνουμε την εφαρμογή. Δεν ζητάμε όνομα, email ή τοποθεσία.
        </Text>
        <View style={styles.row}>
          <Chip label="Αποδοχή" selected={consent === 'accepted'} onPress={() => setConsentChoice('accepted', 'settings')} />
          <Chip label="Απόρριψη" selected={consent === 'rejected'} onPress={() => setConsentChoice('rejected', 'settings')} />
        </View>
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
    h2: { fontSize: T.h2, fontWeight: '800', color: Colors.ink },
    text: { fontSize: T.body, color: Colors.ink2, lineHeight: Math.round(T.body * 1.4) },
    muted: { fontSize: T.caption, color: Colors.ink3 },
    row: { flexDirection: 'row', gap: Space[2], flexWrap: 'wrap' },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
    preview: { backgroundColor: Colors.bgSoft, borderRadius: Radius.md, padding: Space[3] },
    previewText: { fontSize: T.bodyLg, fontWeight: '600', color: Colors.ink },
    link: { minHeight: 44, justifyContent: 'center' },
    linkText: { fontSize: T.body, color: Colors.brand, fontWeight: '700', textDecorationLine: 'underline' },
    version: { fontSize: T.caption, color: Colors.ink3, textAlign: 'center' },
  });
