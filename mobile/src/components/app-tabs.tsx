// The four tabs (owner decision 2026-10-20): Αρχική / Προσφορές / Αναζήτηση /
// Λίστα. Native tab bar on both platforms; icons are the systems' own line
// glyphs (Material Symbols / SF Symbols) — no emoji in the product UI.
import { NativeTabs } from 'expo-router/native-tabs';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Colors.surface}
      tintColor={Colors.brand}
      labelStyle={{ color: Colors.ink2 }}>
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
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
