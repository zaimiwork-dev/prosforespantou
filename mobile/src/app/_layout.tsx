// Root: a stack with the four tabs at the bottom of it, so screens such as
// the product page open OVER the tabs with a back arrow (and the Android
// back gesture) instead of replacing a tab.
import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: Colors.brand, background: Colors.bg, card: Colors.surface, text: Colors.ink, border: Colors.line },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: Colors.brand, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="offer/[id]" options={{ title: 'Προσφορά' }} />
      </Stack>
    </ThemeProvider>
  );
}
