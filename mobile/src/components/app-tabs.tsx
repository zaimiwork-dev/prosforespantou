// The four tabs (owner decision 2026-10-20): Αρχική / Προσφορές / Αναζήτηση /
// Λίστα. Native tab bar on both platforms; icons are the systems' own line
// glyphs (Material Symbols / SF Symbols) — no emoji in the product UI.
import { NativeTabs } from 'expo-router/native-tabs';
import { Colors, Fonts } from '@/constants/theme';
import { useShoppingList } from '@/lib/shopping-list';

export default function AppTabs() {
  const count = useShoppingList().items.length;
  return (
    <NativeTabs
      backgroundColor={Colors.surface}
      tintColor={Colors.brand}
      // bgSoft pill behind the active icon, red count badge on Λίστα (DESIGN.md «Tab bar»).
      indicatorColor={Colors.bgSoft}
      // Android shows only the selected tab's label once there are four tabs
      // ('auto'); our shoppers should not have to guess what an icon means.
      labelVisibilityMode="labeled"
      badgeBackgroundColor={Colors.accent}
      badgeTextColor="#fff"
      labelStyle={{ color: Colors.ink2, fontFamily: Fonts.sans600, fontSize: 13 }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Αρχική</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="deals">
        <NativeTabs.Trigger.Label>Προσφορές</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tag', selected: 'tag.fill' }} md="local_offer" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Αναζήτηση</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="list">
        <NativeTabs.Trigger.Label>Λίστα</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'checklist', selected: 'checklist' }} md="checklist" />
        {/* No element at all for an empty list: a Badge with text is drawn even
            when `hidden` is set (the text wins), so Android showed a red «0». */}
        {count > 0 ? <NativeTabs.Trigger.Badge>{count > 99 ? '99+' : String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
