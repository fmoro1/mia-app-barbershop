import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Calendar } from "react-native-calendars";
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
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, w, n] = await Promise.all([api.adminBookings(date), api.adminWaitlist(), api.adminNotifications()]);
      setItems(b);
      setWaitlistCount(w.filter((x: any) => !x.notified).length);
      setNotifs(n.items || []);
      setUnread(n.unread || 0);
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
        <View style={{ flex: 1 }}>
          <Text style={styles.tagline}>PANNELLO ADMIN</Text>
          <Text style={styles.title}>Agenda</Text>
        </View>
        <Pressable
          testID="admin-bell-btn"
          onPress={async () => { setNotifOpen(true); if (unread > 0) { try { await api.markAllNotifRead(); } catch {} setTimeout(load, 300); } }}
          style={styles.bellBtn}
        >
          <Ionicons name="notifications" size={22} color={theme.colors.brand} />
          {unread > 0 && (
            <View testID="bell-badge" style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </Pressable>
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

      <View style={styles.dateNavRow}>
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
        <Pressable testID="date-picker-btn" onPress={() => setDatePickerOpen(true)} style={styles.datePickerBtn}>
          <Ionicons name="calendar-outline" size={20} color={theme.colors.brand} />
        </Pressable>
      </View>

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

      <Modal visible={datePickerOpen} transparent animationType="slide" onRequestClose={() => setDatePickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDatePickerOpen(false)} />
        <View style={styles.notifSheet}>
          <View style={styles.handle} />
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle}>Vai a data</Text>
            <Pressable testID="date-picker-close" onPress={() => setDatePickerOpen(false)}>
              <Ionicons name="close" size={22} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <Calendar
            testID="admin-date-picker"
            firstDay={1}
            current={date}
            onDayPress={(d: any) => { setDate(d.dateString); setDatePickerOpen(false); }}
            markedDates={{ [date]: { selected: true, selectedColor: theme.colors.brand } }}
            theme={{
              backgroundColor: theme.colors.surfaceSecondary,
              calendarBackground: theme.colors.surfaceSecondary,
              dayTextColor: theme.colors.onSurface,
              monthTextColor: theme.colors.onSurface,
              textDisabledColor: theme.colors.onSurfaceTertiary,
              arrowColor: theme.colors.brand,
              todayTextColor: theme.colors.brand,
              selectedDayBackgroundColor: theme.colors.brand,
              selectedDayTextColor: theme.colors.onBrand,
              textSectionTitleColor: theme.colors.onSurfaceTertiary,
            }}
          />
        </View>
      </Modal>

      <Modal visible={notifOpen} transparent animationType="slide" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setNotifOpen(false)} />
        <View style={styles.notifSheet} testID="notif-sheet">
          <View style={styles.handle} />
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle}>Notifiche</Text>
            <Pressable testID="notif-close" onPress={() => setNotifOpen(false)}>
              <Ionicons name="close" size={22} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView>
            {notifs.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Ionicons name="notifications-off-outline" size={40} color={theme.colors.onSurfaceTertiary} />
                <Text style={{ color: theme.colors.onSurfaceTertiary, marginTop: theme.spacing.sm }}>Nessuna notifica</Text>
              </View>
            ) : notifs.map((n) => {
              const dt = new Date(n.created_at);
              const meta: any = n.meta || {};
              return (
                <View key={n.notif_id} style={styles.notifItem} testID={`notif-${n.notif_id}`}>
                  <View style={styles.notifIcon}>
                    <Ionicons name={n.kind === "new_booking" ? "calendar" : "notifications"} size={18} color={theme.colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifItemTitle}>{n.title}</Text>
                    <Text style={styles.notifBody}>{n.body}</Text>
                    <Text style={styles.notifDate}>{dt.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · {dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.md, padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.brand, position: "relative" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.surface },
  badgeText: { color: theme.colors.onBrand, fontSize: 10, fontWeight: "700" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  notifSheet: { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%", backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong },
  handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center", marginBottom: theme.spacing.md },
  notifHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },
  notifTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  notifEmpty: { alignItems: "center", padding: theme.spacing.xxxl },
  notifItem: { flexDirection: "row", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  notifIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  notifItemTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "600" },
  notifBody: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.sm, marginTop: 2, lineHeight: 18 },
  notifDate: { color: theme.colors.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
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
