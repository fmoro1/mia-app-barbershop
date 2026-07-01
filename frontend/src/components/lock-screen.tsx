import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";

export default function LockScreen() {
  const { unlock, logout, user } = useAuth();

  // Auto-trigger biometric prompt on mount
  useEffect(() => {
    if (Platform.OS !== "web") {
      unlock();
    }
  }, [unlock]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="lock-screen">
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={44} color={theme.colors.brand} />
        </View>
        <Text style={styles.tagline}>APP BLOCCATA</Text>
        <Text style={styles.title}>Sblocca con Face ID{"\n"}o Touch ID</Text>
        {user && <Text style={styles.email}>{user.email}</Text>}
        <Pressable testID="lock-unlock-btn" onPress={unlock} style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}>
          <Ionicons name="finger-print" size={20} color={theme.colors.onBrand} />
          <Text style={styles.btnPrimaryText}>Sblocca</Text>
        </Pressable>
        <Pressable testID="lock-logout-btn" onPress={logout} style={{ padding: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <Text style={styles.logoutText}>Esci con un altro account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.brand, marginBottom: theme.spacing.lg },
  tagline: { color: theme.colors.brand, letterSpacing: 4, fontSize: 11, fontWeight: "500" },
  title: { color: theme.colors.onSurface, fontSize: 30, textAlign: "center", fontWeight: "500", lineHeight: 36 },
  email: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base, marginTop: theme.spacing.sm },
  btnPrimary: { flexDirection: "row", gap: theme.spacing.sm, backgroundColor: theme.colors.brand, padding: theme.spacing.lg, paddingHorizontal: theme.spacing.xxxl, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.xl },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  logoutText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base },
});
