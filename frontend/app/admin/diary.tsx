import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { theme, formatCents, formatDuration } from "@/src/theme";

type Booking = {
  booking_id: string; user_name?: string; user_email: string; service_name: string;
  start_at: string; duration_minutes: number; status: string; total_cents: number;
  payment_status: string; must_pay_online: boolean; notes?: string;
};

function daysAround(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function AdminDiary() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState<string>(today);
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [b, w] = await Promise.all([api.adminBookings(date), api.adminWaitlist()]);
      setItems(b);
      setWaitlistCount(w.filter((x: any) => !x.notified).length);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [date]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-refresh every 15s while screen is focused
  useFocusEffect(useCallback(() => {
    const t = setInterval(() => { load(); }, 15000);
    return () => clearInterval(t);
  }, [load]));

  const dayDates = Array.from({ length: 14 }, (_, i) => daysAround(i));
  const active = items.filter((b) => b.status !== "cancelled");
  const revenueCents = active.reduce((sum, b) => sum + (b.total_cents || 0), 0);

  const cancel = async (id: string) => {
    try { await api.adminUpdateBooking(id, { status: "cancelled" }); load(); } catch {}
  };
  const markCompleted = async (id: string) => {
    try { await api.adminUpdateBooking(id, { status: "completed" }); load(); } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-diary">
      <View style={styles.header}>
        <View>
          <Text style={styles.tagline}>PANNELLO ADMIN</Text>
          <Text style={styles.title}>Agenda</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Prenotazioni</Text>
          <Text style={styles.statValue}>{active.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Incasso stimato</Text>
          <Text style={styles.statValue}>{formatCents(revenueCents)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Lista attesa</Text>
          <Text style={styles.statValue}>{waitlistCount}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
        {dayDates.map((d) => {
          const dt = new Date(d);
          const selected = d === date;
          return (
            <Pressable
              key={d}
              testID={`date-chip-${d}`}
              onPress={() => setDate(d)}
              style={[styles.dateChip, selected && styles.dateChipActive]}
            >
              <Text style={[styles.dateChipDay, selected && styles.dateChipDayActive]}>{dt.toLocaleDateString("it-IT", { weekday: "short" })}</Text>
              <Text style={[styles.dateChipNum, selected && styles.dateChipNumActive]}>{dt.getDate()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={48} color={theme.colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nessun appuntamento oggi</Text>
            <Text style={styles.emptySub}>Goditi la calma.</Text>
          </View>
        ) : (
          items.map((b) => {
            const dt = new Date(b.start_at);
            const cancelled = b.status === "cancelled";
            return (
              <View key={b.booking_id} testID={`admin-booking-${b.booking_id}`} style={[styles.card, cancelled && { opacity: 0.5 }]}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>{dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</Text>
                  <Text style={styles.durText}>{formatDuration(b.duration_minutes)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svcName}>{b.service_name}</Text>
                  <Text style={styles.clientName}>{b.user_name || b.user_email}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, b.status === "confirmed" ? styles.badgeSuccess : b.status === "completed" ? styles.badgeInfo : styles.badgeMuted]}>
                      <Text style={[styles.badgeText, { color: b.status === "confirmed" ? theme.colors.success : theme.colors.onSurfaceTertiary }]}>{b.status}</Text>
                    </View>
                    <Text style={styles.priceSmall}>{formatCents(b.total_cents)}</Text>
                  </View>
                  {!cancelled && (
                    <View style={styles.actions}>
                      <Pressable testID={`admin-complete-${b.booking_id}`} onPress={() => markCompleted(b.booking_id)} style={styles.actionBtn}>
                        <Ionicons name="checkmark-done" size={14} color={theme.colors.success} />
                        <Text style={[styles.actionText, { color: theme.colors.success }]}>Completa</Text>
                      </Pressable>
                      <Pressable testID={`admin-cancel-${b.booking_id}`} onPress={() => cancel(b.booking_id)} style={styles.actionBtn}>
                        <Ionicons name="close" size={14} color={theme.colors.error} />
                        <Text style={[styles.actionText, { color: theme.colors.error }]}>Annulla</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 4 },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xl, marginBottom: theme.spacing.md },
  statCard: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  statLabel: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  statValue: { color: theme.colors.brand, fontSize: theme.fontSize.xl, fontWeight: "600", marginTop: 2 },
  dateRow: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm, paddingBottom: theme.spacing.md, height: 76 },
  dateChip: { width: 56, height: 60, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, flexShrink: 0 },
  dateChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  dateChipDay: { color: theme.colors.onSurfaceTertiary, fontSize: 10, textTransform: "uppercase" },
  dateChipDayActive: { color: theme.colors.onBrand },
  dateChipNum: { color: theme.colors.onSurface, fontSize: theme.fontSize.xl, fontWeight: "600" },
  dateChipNumActive: { color: theme.colors.onBrand },
  card: { flexDirection: "row", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  timeCol: { alignItems: "center", justifyContent: "center", width: 64, borderRightWidth: 1, borderRightColor: theme.colors.border, paddingRight: theme.spacing.md },
  timeText: { color: theme.colors.brand, fontSize: theme.fontSize.xl, fontWeight: "600" },
  durText: { color: theme.colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  svcName: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  clientName: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.pill },
  badgeSuccess: { backgroundColor: "rgba(134,239,172,0.1)" },
  badgeInfo: { backgroundColor: theme.colors.surfaceTertiary },
  badgeMuted: { backgroundColor: theme.colors.surfaceTertiary },
  badgeText: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  priceSmall: { color: theme.colors.brand, fontSize: theme.fontSize.base, fontWeight: "600" },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionBtn: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.md },
  actionText: { fontSize: theme.fontSize.sm, fontWeight: "500" },
  empty: { alignItems: "center", padding: theme.spacing.xxxl, gap: theme.spacing.md },
  emptyText: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  emptySub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base },
});
