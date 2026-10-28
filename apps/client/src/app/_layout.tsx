import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createClientQueryClient } from '../lib/query';
import { AppThemeProvider, useAppTheme } from '../ui/theme';

function AppNavigator() {
  const theme = useAppTheme();
  useEffect(() => {
    if (Platform.OS === 'web' && typeof globalThis.document !== 'undefined') {
      globalThis.document.title = 'Molokh';
    }
  }, []);
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShown: false,
        title: 'Molokh',
      }} />
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createClientQueryClient);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AppNavigator />
        </AppThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

