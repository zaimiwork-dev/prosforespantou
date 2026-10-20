// Placeholder until its week in APP_PLAN.md.
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Space, Type } from '@/constants/theme';

export default function Screen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.h1}>Αναζήτηση</Text>
      <Text style={styles.body}>Βρες ένα προϊόν σε όλα τα σούπερ μάρκετ — έρχεται την επόμενη εβδομάδα.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg, padding: Space[4] },
  h1: { fontSize: Type.h1, fontWeight: '800', color: Colors.brand, marginBottom: Space[3] },
  body: { fontSize: Type.bodyLg, color: Colors.ink2, lineHeight: 24 },
});
