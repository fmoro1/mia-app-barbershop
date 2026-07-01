import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, Platform, Share, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";
import ChangePasswordModal from "@/src/components/change-password-modal";

const BIO_KEY = "bshop_biometric_enabled";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [cpOpen, setCpOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(has && enrolled);
      const en = await storage.getItem<boolean>(BIO_KEY, false);
      setBioEnabled(!!en);
    })();
  }, []);

  const toggleBio = async (v: boolean) => {
    if (v) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Attiva login biometrico" });
      if (!res.success) return;
    }
    setBioEnabled(v);
    await storage.setItem(BIO_KEY, v);
  };

  const shareBookingLink = async () => {
    const url = process.env.EXPO_PUBLIC_BACKEND_URL || "";
    try { await Share.share({ message: `Prenota da noi: ${url}`, url }); } catch {}
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Accedi per vedere il tuo profilo</Text>
          <Pressable testID="profile-login-btn" onPress={() => router.push("/login")} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Accedi</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user.name || user.email)[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.name || "-"}</Text>
        <Text style={styles.email}>{user.email}</Text>

        {user.role === "admin" && (
          <Pressable testID="go-admin-btn" onPress={() => router.push("/admin/diary")} style={styles.adminBanner}>
            <Ionicons name="briefcase" size={20} color={theme.colors.brand} />
            <Text style={styles.adminBannerText}>Vai al pannello admin</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.brand} />
          </Pressable>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SICUREZZA</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Blocca app con Face ID / Touch ID</Text>
              <Text style={styles.rowSub}>{bioAvailable ? "Chiederà biometria a ogni apertura dell'app" : Platform.OS === "web" ? "Disponibile solo su iOS/Android" : "Non disponibile su questo dispositivo"}</Text>
            </View>
            <Switch
              testID="biometric-switch"
              disabled={!bioAvailable}
              value={bioEnabled}
              onValueChange={toggleBio}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor="#fff"
            />
          </View>
          <Pressable testID="change-password-btn" onPress={() => setCpOpen(true)} style={[styles.row, { marginTop: theme.spacing.sm }]}>
            <Ionicons name="key-outline" size={22} color={theme.colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Cambia password</Text>
              <Text style={styles.rowSub}>Aggiorna la password del tuo account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONDIVIDI</Text>
          <Pressable testID="share-social-btn" onPress={shareBookingLink} style={styles.row}>
            <Ionicons name="share-social" size={22} color={theme.colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Condividi link prenotazione</Text>
              <Text style={styles.rowSub}>Metti nel bio Instagram o invia a WhatsApp</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <Pressable testID="logout-btn" onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={styles.logoutText}>Esci</Text>
        </Pressable>
      </ScrollView>
      <ChangePasswordModal visible={cpOpen} onClose={() => setCpOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.brandTertiary, alignSelf: "center", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.brand, marginBottom: theme.spacing.md, marginTop: theme.spacing.md },
  avatarText: { color: theme.colors.brand, fontSize: 36, fontWeight: "500" },
  name: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500", textAlign: "center" },
  email: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base, textAlign: "center", marginBottom: theme.spacing.xl },
  adminBanner: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.brandTertiary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.brand, marginBottom: theme.spacing.xl },
  adminBannerText: { color: theme.colors.brand, fontSize: theme.fontSize.lg, fontWeight: "600", flex: 1 },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2, marginBottom: theme.spacing.md, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  rowLabel: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  rowSub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 },
  logoutBtn: { flexDirection: "row", gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.danger, alignItems: "center", justifyContent: "center", marginTop: theme.spacing.lg },
  logoutText: { color: theme.colors.error, fontSize: theme.fontSize.lg, fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, padding: theme.spacing.xl },
  emptyText: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.lg },
  btnPrimary: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, paddingHorizontal: theme.spacing.xxxl, borderRadius: theme.radius.md },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
