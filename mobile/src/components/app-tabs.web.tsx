// Browser build only (the owner's iPhone preview, 2026-11-05). NativeTabs on
// web renders a floating pill at the TOP that covers screen titles, hides the
// fourth tab on a phone-width screen and puts dark text on dark grey — nothing
// like the Android app. A plain bottom tab bar is what the Android build shows.
import { Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useShoppingList } from '@/lib/shopping-list';

type IconProps = { color: string; size: number };

// Line glyphs matching the Material Symbols the Android tabs use.
const icons: Record<string, (p: IconProps) => React.ReactElement> = {
  index: ({ color, size }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round">
      <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </Svg>
  ),
  deals: ({ color, size }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round">
      <Path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <Path d="M7.5 7.5h.01" strokeLinecap="round" strokeWidth={3} />
    </Svg>
  ),
  search: ({ color, size }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5.2-5.2" />
    </Svg>
  ),
  list: ({ color, size }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M10 6h11M10 12h11M10 18h11" />
    </Svg>
  ),
};

const titles: Record<string, string> = { index: 'Αρχική', deals: 'Προσφορές', search: 'Αναζήτηση', list: 'Λίστα' };

export default function AppTabs() {
  const count = useShoppingList().items.length;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        title: titles[route.name],
        // bgSoft pill behind the active icon, like the Android indicator.
        tabBarIcon: ({ color, size, focused }) => (
          <View style={[styles.pill, focused && styles.pillActive]}>{icons[route.name]({ color: String(color), size })}</View>
        ),
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.ink2,
        // Explicit height and line height: the defaults clip Greek labels at 13px.
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.line, height: 72 },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarLabelStyle: { fontFamily: Fonts.sans600, fontSize: 13, lineHeight: 18 },
        tabBarBadgeStyle: { backgroundColor: Colors.accent, color: '#fff', fontFamily: Fonts.sans700, fontSize: 12 },
      })}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="deals" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="list" options={{ tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: Colors.bgSoft },
});
