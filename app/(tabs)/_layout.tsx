import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabIcons: Record<string, IconName> = {
  index: 'home-outline',
  calendar: 'calendar-outline',
  add: 'add-circle-outline',
  search: 'search-outline',
  recap: 'stats-chart-outline',
};

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: '#356859',
  tabBarInactiveTintColor: '#7B827E',
  tabBarStyle: {
    borderTopColor: '#D9DED8',
    backgroundColor: '#FFFCF6',
  },
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        ...tabScreenOptions,
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons
            color={color}
            name={
              focused
                ? tabIcons[route.name] ?? 'ellipse'
                : tabIcons[route.name] ?? 'ellipse-outline'
            }
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="calendar" options={{ title: '달력' }} />
      <Tabs.Screen name="add" options={{ title: '추가' }} />
      <Tabs.Screen name="search" options={{ title: '검색' }} />
      <Tabs.Screen name="recap" options={{ title: '결산' }} />
    </Tabs>
  );
}
