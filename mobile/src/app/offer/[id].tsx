// Product page — placeholder until ticket APP-203 (week 2, APP_PLAN.md).
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Space, Type } from '@/constants/theme';

export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={styles.screen}>
      <Text style={styles.body}>Η σελίδα του προϊόντος έρχεται την επόμενη εβδομάδα.</Text>
      <Text style={styles.small}>{id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg, padding: Space[4] },
  body: { fontSize: Type.bodyLg, color: Colors.ink2 },
  small: { fontSize: Type.caption, color: Colors.ink4, marginTop: Space[2] },
});
