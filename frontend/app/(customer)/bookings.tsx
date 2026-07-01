import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { theme, formatCents } from "@/src/theme";

type Booking = {
  booking_id: string; service_name: string; start_at: string; duration_minutes: number;
  status: string; total_cents: number; must_pay_online: boolean; payment_status: string;
};

export default function Bookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try { setItems(await api.myBookings()); } catch {}
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = async (id: string) => {
    try { await api.cancelBooking(id); load(); } catch {}
  };

  const upcoming = items.filter((i) => i.status === "confirmed" && new Date(i.start_at) >= new Date());
  const past = items.filter((i) => !(i.status === "confirmed" && new Date(i.start_at) >= new Date()));

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="my-bookings-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Le mie prenotazioni</Text>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={theme.colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nessuna prenotazione ancora</Text>
            <Pressable testID="go-book-btn" onPress={() => router.replace("/(customer)/home")} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>Prenota ora</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: theme.spacing.xl }}>
            {upcoming.length > 0 && <Text style={styles.section}>PROSSIMI</Text>}
            {upcoming.map((b) => (
              <BookingCard key={b.booking_id} b={b} onCancel={() => cancel(b.booking_id)} canCancel />
            ))}
            {past.length > 0 && <Text style={[styles.section, { marginTop: theme.spacing.lg }]}>STORICO</Text>}
            {past.map((b) => <BookingCard key={b.booking_id} b={b} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BookingCard({ b, onCancel, canCancel }: { b: Booking; onCancel?: () => void; canCancel?: boolean }) {
  const dt = new Date(b.start_at);
  const statusColor = b.status === "confirmed" ? theme.colors.success : b.status === "cancelled" ? theme.colors.error : theme.colors.onSurfaceTertiary;
  return (
    <View testID={`booking-${b.booking_id}`} style={styles.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceName}>{b.service_name}</Text>
          <Text style={styles.datetime}>{dt.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })} · {dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{b.status === "confirmed" ? "Confermata" : b.status === "cancelled" ? "Annullata" : b.status}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.price}>{formatCents(b.total_cents)}</Text>
        {b.must_pay_online && b.payment_status === "unpaid" && (
          <View style={styles.payBadge}><Ionicons name="card-outline" size={12} color={theme.colors.warning} /><Text style={styles.payBadgeText}>Da pagare</Text></View>
        )}
        {canCancel && (
          <Pressable testID={`cancel-${b.booking_id}`} onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Annulla</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  section: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2, marginBottom: theme.spacing.md, fontWeight: "500" },
  card: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  serviceName: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500", marginBottom: 4 },
  datetime: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base },
  statusPill: { paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  price: { color: theme.colors.brand, fontSize: theme.fontSize.lg, fontWeight: "600", flex: 1 },
  payBadge: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: 4, backgroundColor: "rgba(252,211,77,0.15)", borderRadius: theme.radius.pill },
  payBadgeText: { color: theme.colors.warning, fontSize: 11, fontWeight: "600" },
  cancelBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.danger, borderRadius: theme.radius.md },
  cancelText: { color: theme.colors.error, fontSize: theme.fontSize.base, fontWeight: "500" },
  empty: { alignItems: "center", padding: theme.spacing.xxxl, gap: theme.spacing.md },
  emptyText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.lg },
  btnPrimary: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, paddingHorizontal: theme.spacing.xxl, borderRadius: theme.radius.md, marginTop: theme.spacing.md },
  btnPrimaryText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: theme.fontSize.lg },
});
