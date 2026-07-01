import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Share, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";
import { api } from "@/src/api";
import ChangePasswordModal from "@/src/components/change-password-modal";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export default function AdminProfile() {
  const { user, logout } = useAuth();
  const bookingUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "";
  const [cpOpen, setCpOpen] = useState(false);
  const [weekly, setWeekly] = useState<Record<string, [string, string][]>>({});

  const load = useCallback(async () => {
    try {
      const s = await api.getSchedule();
      setWeekly(s.weekly || {});
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    try { await Share.share({ message: `Prenota da Barber Shop Francesco Moretti: ${bookingUrl}`, url: bookingUrl }); } catch {}
  };
  const copy = async () => {
    try { await Clipboard.setStringAsync(bookingUrl); } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-profile">
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }}>
        <Text style={styles.tagline}>PANNELLO ADMIN</Text>
        <Text style={styles.title}>Profilo</Text>

        <View style={styles.card}>
          <View style={styles.avatar}><Ionicons name="briefcase" size={28} color={theme.colors.brand} /></View>
          <Text style={styles.name}>{user?.name || "Admin"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <Text style={styles.sectionTitle}>WIDGET SOCIAL / BIO INSTAGRAM</Text>
        <View style={styles.card}>
          <Text style={styles.linkLabel}>Link pubblico per prenotare</Text>
          <Text style={styles.linkValue} numberOfLines={2}>{bookingUrl}</Text>
          <View style={styles.row}>
            <Pressable testID="admin-copy-link" onPress={copy} style={styles.smallBtn}>
              <Ionicons name="copy-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.smallBtnText}>Copia</Text>
            </Pressable>
            <Pressable testID="admin-share-link" onPress={share} style={styles.smallBtn}>
              <Ionicons name="share-social-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.smallBtnText}>Condividi</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Incolla questo link nella bio di Instagram / TikTok / WhatsApp. I clienti possono prenotare direttamente dal browser, senza scaricare l'app.</Text>
        </View>

        <Text style={styles.sectionTitle}>SICUREZZA</Text>
        <Pressable testID="admin-change-password" onPress={() => setCpOpen(true)} style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
            <Ionicons name="key-outline" size={22} color={theme.colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" }}>Cambia password</Text>
              <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 }}>Aggiorna la password admin</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceTertiary} />
          </View>
        </Pressable>

        <Text style={styles.sectionTitle}>INFORMAZIONI SALONE</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={theme.colors.brand} />
            <Text style={styles.infoText}>P.za Giuseppe Mazzini, 18{"\n"}06029 Valfabbrica PG</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={theme.colors.brand} />
            <View style={{ flex: 1, gap: 2 }}>
              {DAY_NAMES.map((name, i) => {
                const wins = weekly[String(i)] || [];
                const closed = wins.length === 0;
                return (
                  <View key={i} style={styles.hourRow}>
                    <Text style={styles.dayName}>{name}</Text>
                    <Text style={[styles.dayHours, closed && { color: theme.colors.onSurfaceTertiary }]}>
                      {closed ? "Chiuso" : wins.map((w) => `${w[0]}-${w[1]}`).join(" · ")}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <Pressable testID="admin-logout" onPress={logout} style={styles.logoutBtn}>
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
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 4 },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500", marginBottom: theme.spacing.xl },
  card: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.sm },
  name: { color: theme.colors.onSurface, fontSize: theme.fontSize.xl, fontWeight: "500" },
  email: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base },
  sectionTitle: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2, marginBottom: theme.spacing.md, fontWeight: "500" },
  linkLabel: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, textTransform: "uppercase", letterSpacing: 1 },
  linkValue: { color: theme.colors.brand, fontSize: theme.fontSize.base, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  row: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  smallBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.brand },
  smallBtnText: { color: theme.colors.brand, fontWeight: "600" },
  hint: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.sm, lineHeight: 18 },
  infoRow: { flexDirection: "row", gap: theme.spacing.md, alignItems: "flex-start", paddingVertical: theme.spacing.sm },
  infoText: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, flex: 1, lineHeight: 22 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.xs },
  hourRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  dayName: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "500", width: 90 },
  dayHours: { color: theme.colors.brand, fontSize: theme.fontSize.base, flex: 1, textAlign: "right" },
  logoutBtn: { flexDirection: "row", gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.danger, alignItems: "center", justifyContent: "center", marginTop: theme.spacing.md },
  logoutText: { color: theme.colors.error, fontSize: theme.fontSize.lg, fontWeight: "500" },
});
