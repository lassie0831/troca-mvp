import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, type ColorValue } from 'react-native';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
        // Desktop browsers' font metrics clip the label at the default 49 px height.
        tabBarStyle: Platform.OS === 'web' ? { height: 60, paddingBottom: 6 } : undefined,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Trocas perto de você', tabBarLabel: 'Explorar', tabBarIcon: icon('swap-horizontal') }} />
      <Tabs.Screen name="my-items" options={{ title: 'Meus itens', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="proposals" options={{ title: 'Propostas', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
