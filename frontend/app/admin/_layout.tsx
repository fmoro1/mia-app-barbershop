import React from "react";
import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.colors.brand} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin") return <Redirect href="/(customer)/home" />;

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
      <Tabs.Screen name="diary" options={{ title: "Agenda", tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }} />
      <Tabs.Screen name="clients" options={{ title: "Clienti", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: "Servizi", tabBarIcon: ({ color, size }) => <Ionicons name="cut" color={color} size={size} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Orari", tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profilo", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
    </Tabs>
  );
}
