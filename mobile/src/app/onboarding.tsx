// First-run onboarding: what the app does, pick stores (optional), and the
// usage-statistics choice. Large text on purpose (older audience), whatever
// the text-size setting. Finishing sets `onboarded`, which flips the root
// layout's guards and lands the shopper on the tabs.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setConsentChoice } from '@/lib/analytics';
import { updateSettings, useSettings } from '@/lib/settings';
import { ChainTile, TileGrid } from '@/components/chain-tile';
import { useChainList } from '@/components/filters/use-chain-list';
import { Colors, Radius, Space, TypeLarge, type TypeScale } from '@/constants/theme';

// Always the large scale here.
const BIG: TypeScale = TypeLarge;

const STEPS = 3;

export default function Onboarding() {
  const styles = useMemo(() => makeStyles(BIG), []);
  const [step, setStep] = useState(0);
  const { myChains } = useSettings();
  const { chains, failed, retry } = useChainList();

  const toggleChain = (id: string) =>
    updateSettings({ myChains: myChains.includes(id) ? myChains.filter((c) => c !== id) : [...myChains, id] });

  const choose = (value: 'accepted' | 'rejected') => {
    setConsentChoice(value, 'onboarding');
    updateSettings({ onboarded: true });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.step}>Βήμα {step + 1} από {STEPS}</Text>

        {step === 0 ? (
          <View style={styles.block}>
            <Text style={styles.h1}>Όλες οι προσφορές,</Text>
            <Text style={[styles.h1, styles.h1Italic]}>σε ένα μέρος</Text>
            <Text style={styles.text}>Βλέπεις τις προσφορές όλων των σούπερ μάρκετ σε ένα μέρος.</Text>
            <Text style={styles.text}>Βρίσκεις πού κάθε προϊόν είναι φθηνότερο, χωρίς να ψάχνεις φυλλάδια.</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.block}>
            <Text style={styles.h1}>Τα καταστήματά σου</Text>
            <Text style={styles.text}>Διάλεξε πού ψωνίζεις, για να βλέπεις πρώτα τις δικές τους προσφορές. Μπορείς να το προσπεράσεις.</Text>
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
                  <Pressable style={styles.primary} onPress={retry} accessibilityRole="button">
                    <Text style={styles.primaryText}>Δοκίμασε ξανά</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Text style={styles.muted}>Φόρτωση καταστημάτων…</Text>
            )}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.block}>
            <Text style={styles.h1}>Ανώνυμα στατιστικά χρήσης</Text>
            <Text style={styles.text}>
              Μας βοηθάς να βελτιώνουμε την εφαρμογή; Αν δεχτείς, μετράμε ανώνυμα ποιες προσφορές πατιούνται, με έναν τυχαίο κωδικό της εφαρμογής. Δεν ζητάμε όνομα, email ή τοποθεσία.
            </Text>
            <Text style={styles.text}>
              Αν απορρίψεις, η εφαρμογή λειτουργεί ακριβώς το ίδιο και δεν στέλνουμε τίποτα. Μπορείς να αλλάξεις γνώμη όποτε θέλεις στις Ρυθμίσεις.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step < 2 ? (
          <>
            <Pressable style={styles.primary} onPress={() => setStep(step + 1)} accessibilityRole="button">
              <Text style={styles.primaryText}>Επόμενο</Text>
            </Pressable>
            <View style={styles.links}>
              {step > 0 ? (
                <Pressable style={styles.linkBtn} onPress={() => setStep(step - 1)} accessibilityRole="button">
                  <Text style={styles.linkText}>Πίσω</Text>
                </Pressable>
              ) : null}
              {/* The statistics choice is never skipped, only the stores. */}
              <Pressable style={styles.linkBtn} onPress={() => setStep(2)} accessibilityRole="button">
                <Text style={styles.linkText}>Παράλειψη</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.choices}>
              <Pressable style={styles.choice} onPress={() => choose('accepted')} accessibilityRole="button">
                <Text style={styles.choiceText}>Αποδοχή</Text>
              </Pressable>
              <Pressable style={styles.choice} onPress={() => choose('rejected')} accessibilityRole="button">
                <Text style={styles.choiceText}>Απόρριψη</Text>
              </Pressable>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => setStep(1)} accessibilityRole="button">
              <Text style={styles.linkText}>Πίσω</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    content: { padding: Space[6], paddingTop: Space[7], flexGrow: 1 },
    step: { ...T.text.caption, color: Colors.ink3Text, marginBottom: Space[5] },
    block: { gap: Space[4] },
    h1: { ...T.text.hero, color: Colors.ink },
    h1Italic: { ...T.text.heroItalic, color: Colors.brand, marginTop: -Space[3] },
    text: { ...T.text.body, color: Colors.ink },
    muted: { ...T.text.body, color: Colors.ink3Text },
    errorBox: { gap: Space[3], alignItems: 'flex-start' },
    footer: { padding: Space[6], paddingTop: Space[3], gap: Space[3] },
    primary: { backgroundColor: Colors.brand, borderRadius: Radius.pill, minHeight: 56, paddingHorizontal: Space[6], alignItems: 'center', justifyContent: 'center' },
    primaryText: { ...T.text.button, color: '#fff' },
    links: { flexDirection: 'row', justifyContent: 'space-between' },
    linkBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Space[2] },
    linkText: { ...T.text.bodyStrong, color: Colors.brand },
    // Equal weight on purpose: refusing must be as easy as accepting.
    choices: { flexDirection: 'row', gap: Space[3] },
    choice: { flex: 1, minHeight: 56, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.brand, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
    choiceText: { ...T.text.button, color: Colors.brand },
  });
