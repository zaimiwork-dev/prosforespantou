// Root: a stack with the four tabs at the bottom of it, so screens such as
// the product page open OVER the tabs with a back arrow (and the Android
// back gesture) instead of replacing a tab.
import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { NotoSerifDisplay_400Regular, NotoSerifDisplay_400Regular_Italic } from '@expo-google-fonts/noto-serif-display';
import { Colors } from '@/constants/theme';
import { useSettings, useSettingsLoaded } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: Colors.brand, background: Colors.bg, card: Colors.surface, text: Colors.ink, border: Colors.line },
};

export default function RootLayout() {
  const settingsLoaded = useSettingsLoaded();
  // Family keys must match Fonts in constants/theme.ts.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black,
    NotoSerifDisplay_400Regular, NotoSerifDisplay_400Regular_Italic,
  });
  // A font failure must not leave the shopper on a splash forever: fall back to system text.
  const loaded = settingsLoaded && (fontsLoaded || !!fontError);
  const { onboarded } = useSettings();
  // Keep the splash up until storage is read, so a returning shopper never
  // sees the onboarding flash by.
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: Colors.brand, headerBackButtonDisplayMode: 'minimal' }}>
        {/* First launch: only the onboarding is reachable; finishing it flips
            the guards and the router lands on the tabs. */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="offer/[id]" options={{ title: 'Προσφορά' }} />
          <Stack.Screen name="settings" options={{ title: 'Ρυθμίσεις' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
