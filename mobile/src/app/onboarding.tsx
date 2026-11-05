// First-run onboarding: what the app does, pick stores (optional), and the
// usage-statistics choice. Large text on purpose (older audience), whatever
// the text-size setting. Finishing sets `onboarded`, which flips the root
// layout's guards and lands the shopper on the tabs.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChains } from '@/lib/chains';
import { setConsentChoice } from '@/lib/analytics';
import { updateSettings, useSettings } from '@/lib/settings';
import { Chip } from '@/components/chip';
import { Colors, Radius, Space, TypeLarge, type TypeScale } from '@/constants/theme';


// Always the large scale here.
const BIG: TypeScale = TypeLarge;

const STEPS = 3;

export default function Onboarding() {
  const styles = useMemo(() => makeStyles(BIG), []);
  const [step, setStep] = useState(0);
  const { myChains } = useSettings();
  const chains = useChains();

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
            <Text style={styles.h1}>Προσφορές Παντού</Text>
            <Text style={styles.text}>Βλέπεις τις προσφορές όλων των σούπερ μάρκετ σε ένα μέρος.</Text>
            <Text style={styles.text}>Βρίσκεις πού κάθε προϊόν είναι φθηνότερο, χωρίς να ψάχνεις φυλλάδια.</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.block}>
            <Text style={styles.h1}>Τα καταστήματά σου</Text>
            <Text style={styles.text}>Διάλεξε πού ψωνίζεις, για να βλέπεις πρώτα τις δικές τους προσφορές. Μπορείς να το προσπεράσεις.</Text>
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
    step: { fontSize: T.caption, color: Colors.ink3, fontWeight: '600', marginBottom: Space[5] },
    block: { gap: Space[4] },
    h1: { fontSize: T.h1, fontWeight: '800', color: Colors.brand },
    text: { fontSize: T.bodyLg, color: Colors.ink, lineHeight: Math.round(T.bodyLg * 1.4) },
    muted: { fontSize: T.body, color: Colors.ink3 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
    footer: { padding: Space[6], paddingTop: Space[3], gap: Space[3] },
    primary: { backgroundColor: Colors.brand, borderRadius: Radius.md, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#fff', fontSize: T.bodyLg, fontWeight: '800' },
    links: { flexDirection: 'row', justifyContent: 'space-between' },
    linkBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Space[2] },
    linkText: { fontSize: T.body, color: Colors.brand, fontWeight: '700' },
    // Equal weight on purpose: refusing must be as easy as accepting.
    choices: { flexDirection: 'row', gap: Space[3] },
    choice: { flex: 1, minHeight: 56, borderRadius: Radius.md, borderWidth: 2, borderColor: Colors.brand, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
    choiceText: { color: Colors.brand, fontSize: T.bodyLg, fontWeight: '800' },
  });
