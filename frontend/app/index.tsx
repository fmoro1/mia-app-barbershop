import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2OTV8MHwxfHNlYXJjaHwxfHxoaWdoJTIwZW5kJTIwYmFyYmVyc2hvcCUyMGludGVyaW9yJTIwZGFyayUyMHdvb2QlMjB3YXJtJTIwbGlnaHRpbmd8ZW58MHx8fHwxNzgyOTMzMDY4fDA&ixlib=rb-4.1.0&q=85";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "admin") router.replace("/admin/diary");
    else if (user) router.replace("/(customer)/home");
  }, [user, loading, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="landing-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Image source={require("../assets/images/logo-white.png")} style={styles.logo} contentFit="contain" />
          <Text style={styles.subtitle}>Prenota il tuo appuntamento in pochi secondi. Taglio, barba e cura maschile di alta qualità.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="landing-login-btn"
            onPress={() => router.push("/login")}
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.btnPrimaryText}>Accedi</Text>
            <Ionicons name="arrow-forward" size={18} color={theme.colors.onBrand} />
          </Pressable>
          <Pressable
            testID="landing-register-btn"
            onPress={() => router.push("/register")}
            style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnSecondaryText}>Crea account</Text>
          </Pressable>
          <Pressable
            testID="landing-guest-btn"
            onPress={() => router.push("/(customer)/home")}
            style={{ padding: theme.spacing.md, alignItems: "center" }}
          >
            <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base }}>
              Sfoglia i servizi senza account →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  center: { flex: 1, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, justifyContent: "space-between", padding: theme.spacing.xl, paddingTop: Platform.OS === "ios" ? 80 : 60, paddingBottom: theme.spacing.xxl },
  header: { marginTop: theme.spacing.xxxl, alignItems: "center" },
  logo: { width: 320, height: 200, marginBottom: theme.spacing.xl },
  tagline: { color: theme.colors.brand, letterSpacing: 4, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md, fontWeight: "500" },
  title: { color: theme.colors.onSurface, fontSize: 48, lineHeight: 52, fontWeight: "500", marginBottom: theme.spacing.lg },
  subtitle: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.lg, lineHeight: 24, maxWidth: 340, textAlign: "center" },
  actions: { gap: theme.spacing.md },
  btnPrimary: { flexDirection: "row", backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  btnSecondary: { borderWidth: 1, borderColor: theme.colors.borderStrong, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center" },
  btnSecondaryText: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
});
