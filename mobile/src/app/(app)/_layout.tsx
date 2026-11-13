import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primaryDark,
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="items/new" options={{ title: 'Novo item', presentation: 'modal' }} />
      <Stack.Screen name="items/[id]" options={{ title: 'Item' }} />
      <Stack.Screen name="proposals/[id]" options={{ title: 'Proposta' }} />
    </Stack>
  );
}
