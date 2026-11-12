// Grey placeholder shaped like the product page (image block, title lines,
// price, the action row) so nothing jumps when the offer arrives.
import { ScrollView, View } from 'react-native';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Space } from '@/constants/theme';

export function OfferSkeleton() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Space[4] }}
      scrollEnabled={false}
      accessibilityLabel="Φορτώνει η προσφορά"
      accessibilityLiveRegion="polite">
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.line, padding: Space[4], marginBottom: Space[4] }}>
        <Skeleton height={300} radius={Radius.md} />
      </View>
      <Skeleton width={90} height={14} />
      <Skeleton height={26} style={{ marginTop: Space[2] }} />
      <Skeleton width="60%" height={26} style={{ marginTop: Space[2] }} />
      <Skeleton width={110} height={14} style={{ marginTop: Space[5] }} />
      <Skeleton width={150} height={44} style={{ marginTop: Space[2] }} />
      <View style={{ flexDirection: 'row', gap: Space[2], marginTop: Space[5] }}>
        <Skeleton width={56} height={56} radius={28} />
        <Skeleton width={110} height={56} radius={28} />
        <Skeleton height={56} radius={28} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
