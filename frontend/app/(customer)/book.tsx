import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, DateData } from "react-native-calendars";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { theme, formatCents } from "@/src/theme";

type Slot = { start: string; end: string; available: boolean };

export default function Book() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ service_id: string; service_name: string; duration: string; price: string }>();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState<string>(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [reminderHours, setReminderHours] = useState<number>(24);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const loadSlots = useCallback(async () => {
    if (!date) return;
    setLoading(true); setErr(""); setSelectedSlot("");
    try {
      const res = await api.availability(date, params.service_id);
      setSlots(res.slots || []);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [date, params.service_id]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const confirm = async () => {
    if (!user) { router.push("/login"); return; }
    if (!selectedSlot) return;
    setSubmitting(true); setErr(""); setOk("");
    try {
      await api.createBooking({
        service_id: params.service_id,
        start_at: selectedSlot,
        reminder_hours_before: reminderHours,
      });
      setOk("Prenotazione confermata!");
      setTimeout(() => router.replace("/(customer)/bookings"), 900);
    } catch (e: any) { setErr(e.message); }
    setSubmitting(false);
  };

  const joinWaitlist = async () => {
    if (!user) { router.push("/login"); return; }
    setSubmitting(true); setErr(""); setOk("");
    try {
      await api.joinWaitlist({ service_id: params.service_id, desired_date: date });
      setOk("Aggiunto alla lista d'attesa!");
      setTimeout(() => router.replace("/(customer)/waitlist"), 900);
    } catch (e: any) { setErr(e.message); }
    setSubmitting(false);
  };

  const allFull = slots.length > 0 && slots.every((s) => !s.available);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="book-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{params.service_name}</Text>
          <Text style={styles.headerSub}>{params.duration}min · {formatCents(Number(params.price))}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 220 }}>
        <View style={styles.section}>
          <Text style={styles.label}>SCEGLI LA DATA</Text>
          <View style={styles.calendarWrap}>
            <Calendar
              testID="book-calendar"
              current={date}
              minDate={today}
              onDayPress={(d: DateData) => setDate(d.dateString)}
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
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>ORARI DISPONIBILI</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.brand} style={{ marginVertical: theme.spacing.xl }} />
          ) : (
            <>
              {allFull && (
                <View testID="all-full-badge" style={styles.fullBanner}>
                  <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
                  <Text style={styles.fullText}>Tutto pieno. Puoi metterti in lista d'attesa.</Text>
                </View>
              )}
              <View style={styles.slotsGrid}>
                {slots.map((s) => {
                  const label = new Date(s.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
                  const selected = selectedSlot === s.start;
                  return (
                    <Pressable
                      key={s.start}
                      testID={`slot-${label}`}
                      disabled={!s.available}
                      onPress={() => setSelectedSlot(s.start)}
                      style={[styles.slot, !s.available && styles.slotDisabled, selected && styles.slotSelected]}
                    >
                      <Text style={[styles.slotText, !s.available && styles.slotTextDisabled, selected && styles.slotTextSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {selectedSlot && (
          <View style={styles.section}>
            <Text style={styles.label}>PROMEMORIA</Text>
            <Text style={styles.reminderSub}>Quando vuoi ricevere il promemoria?</Text>
            <View style={styles.reminderRow}>
              {[
                { h: 24, l: "1 giorno prima" },
                { h: 12, l: "12h prima" },
                { h: 2, l: "2h prima" },
              ].map((r) => (
                <Pressable
                  key={r.h}
                  testID={`reminder-${r.h}h`}
                  onPress={() => setReminderHours(r.h)}
                  style={[styles.reminderChip, reminderHours === r.h && styles.reminderChipActive]}
                >
                  <Text style={[styles.reminderChipText, reminderHours === r.h && styles.reminderChipTextActive]}>{r.l}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {err ? <Text style={styles.err}>{err}</Text> : null}
        {ok ? <Text style={styles.ok}>{ok}</Text> : null}
        {allFull ? (
          <Pressable testID="join-waitlist-btn" disabled={submitting} onPress={joinWaitlist} style={({ pressed }) => [styles.btnPrimary, (pressed || submitting) && { opacity: 0.7 }]}>
            {submitting ? <ActivityIndicator color={theme.colors.onBrand} /> : <><Ionicons name="time" size={18} color={theme.colors.onBrand} /><Text style={styles.btnPrimaryText}>Unisciti alla lista d'attesa</Text></>}
          </Pressable>
        ) : (
          <Pressable testID="confirm-booking-btn" disabled={!selectedSlot || submitting} onPress={confirm} style={({ pressed }) => [styles.btnPrimary, (!selectedSlot || pressed || submitting) && { opacity: 0.6 }]}>
            {submitting ? <ActivityIndicator color={theme.colors.onBrand} /> : <Text style={styles.btnPrimaryText}>Conferma prenotazione</Text>}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  iconBtn: { width: 40, height: 40, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSecondary },
  headerTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xl, fontWeight: "500" },
  headerSub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 },
  section: { padding: theme.spacing.xl, paddingTop: theme.spacing.lg },
  label: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2, marginBottom: theme.spacing.md, fontWeight: "500" },
  calendarWrap: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  slot: { width: "23%", padding: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.md, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
  slotDisabled: { opacity: 0.3 },
  slotSelected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  slotText: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "500" },
  slotTextDisabled: { textDecorationLine: "line-through" },
  slotTextSelected: { color: theme.colors.onBrand, fontWeight: "600" },
  fullBanner: { flexDirection: "row", gap: theme.spacing.sm, alignItems: "center", padding: theme.spacing.md, backgroundColor: "rgba(252,211,77,0.1)", borderRadius: theme.radius.md, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.warning },
  fullText: { color: theme.colors.warning, flex: 1 },
  reminderSub: { color: theme.colors.onSurfaceSecondary, marginBottom: theme.spacing.md },
  reminderRow: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
  reminderChip: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceSecondary },
  reminderChipActive: { backgroundColor: theme.colors.brandTertiary, borderColor: theme.colors.brand },
  reminderChipText: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base },
  reminderChipTextActive: { color: theme.colors.brand, fontWeight: "600" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.spacing.xl, paddingBottom: Platform.OS === "ios" ? 40 : theme.spacing.xl, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing.sm },
  btnPrimary: { flexDirection: "row", gap: theme.spacing.sm, backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  err: { color: theme.colors.error, textAlign: "center" },
  ok: { color: theme.colors.success, textAlign: "center", fontWeight: "600" },
});
