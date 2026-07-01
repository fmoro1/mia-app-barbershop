import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceSecondary,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 76,
          paddingTop: 8,
          paddingBottom: 20,
        },
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5, fontWeight: "500" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Servizi", tabBarIcon: ({ color, size }) => <Ionicons name="cut-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Prenotazioni", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="waitlist" options={{ title: "Lista d'attesa", tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profilo", tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="book" options={{ href: null }} />
    </Tabs>
  );
}
