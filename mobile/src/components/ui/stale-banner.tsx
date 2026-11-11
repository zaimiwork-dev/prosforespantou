// One quiet row shown above cached content when the latest refresh failed:
// «Χωρίς σύνδεση · τελευταία ενημέρωση 10:32» and a retry. Not a red alert —
// the shopper still has useful data, this only tells them how old it is.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatUpdatedAt } from '@/lib/cache';
import { Colors, Radius, Space, useType } from '@/constants/theme';

export function StaleBanner({ updatedAt, onRetry }: { updatedAt: number | null; onRetry: () => void }) {
  const T = useType();
  const when = updatedAt ? ` · τελευταία ενημέρωση ${formatUpdatedAt(updatedAt)}` : '';
  return (
    <View style={styles.row} accessibilityRole="alert">
      <Text style={[T.text.caption, styles.text]}>{`Χωρίς σύνδεση${when}`}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Δοκίμασε ξανά να φορτώσουν οι προσφορές"
        hitSlop={4}
        style={styles.retry}>
        <Text style={[T.text.caption, styles.retryText]}>Δοκίμασε ξανά</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Space[3],
    minHeight: 44,
    paddingHorizontal: Space[3],
    marginBottom: Space[3],
    backgroundColor: Colors.bgSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  text: { flexShrink: 1, color: Colors.ink2 },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { color: Colors.brand, textDecorationLine: 'underline' },
});
