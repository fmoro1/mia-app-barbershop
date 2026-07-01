import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform, KeyboardAvoidingView, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Calendar } from "react-native-calendars";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

type Weekly = Record<string, [string, string][]>;

type TimeOff = {
  time_off_id: string;
  date_from: string;
  date_to: string;
  type: "closed" | "open";
  time_from?: string | null;
  time_to?: string | null;
  reason?: string;
};

export default function AdminSchedule() {
  const [weekly, setWeekly] = useState<Weekly>({});
  const [timeoff, setTimeoff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [newTOOpen, setNewTOOpen] = useState(false);
  const [newTO, setNewTO] = useState<Partial<TimeOff>>({ type: "closed", date_from: "", date_to: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.getSchedule(), api.listTimeOff()]);
      setWeekly(s.weekly || {});
      setTimeoff(t || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (next: Weekly) => {
    setSaving(true);
    try {
      await api.updateSchedule(next);
      setWeekly(next);
    } catch {}
    setSaving(false);
  };

  const toggleDayClosed = async (dayIdx: number) => {
    const key = String(dayIdx);
    const next = { ...weekly };
    if ((next[key] || []).length > 0) {
      next[key] = [];
    } else {
      next[key] = [["09:00", "12:30"], ["14:00", "19:30"]];
    }
    save(next);
  };

  const updateWindow = (dayIdx: number, winIdx: number, side: 0 | 1, value: string) => {
    const key = String(dayIdx);
    const next = { ...weekly };
    const arr = [...(next[key] || [])];
    arr[winIdx] = [...arr[winIdx]] as [string, string];
    arr[winIdx][side] = value;
    next[key] = arr;
    setWeekly(next);
  };

  const addTimeOff = async () => {
    if (!newTO.date_from || !newTO.date_to) return;
    try {
      await api.createTimeOff(newTO);
      setNewTOOpen(false);
      setNewTO({ type: "closed", date_from: "", date_to: "", reason: "" });
      load();
    } catch {}
  };

  const removeTimeOff = async (id: string) => {
    try { await api.deleteTimeOff(id); load(); } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-schedule">
      <View style={styles.header}>
        <Text style={styles.tagline}>PANNELLO ADMIN</Text>
        <Text style={styles.title}>Orari & Permessi</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl }}>
        {loading ? <ActivityIndicator color={theme.colors.brand} /> : (
          <>
            <Text style={styles.sectionTitle}>ORARIO SETTIMANALE</Text>
            <Text style={styles.helperText}>Attiva/disattiva i giorni di apertura. Tocca "Modifica" per cambiare gli orari.</Text>
            {DAY_NAMES.map((name, i) => {
              const key = String(i);
              const windows = weekly[key] || [];
              const closed = windows.length === 0;
              return (
                <View key={key} style={styles.dayCard} testID={`day-card-${i}`}>
                  <View style={styles.dayRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayName}>{name}</Text>
                      <Text style={styles.dayHours}>
                        {closed ? "Chiuso" : windows.map((w) => `${w[0]}-${w[1]}`).join(" · ")}
                      </Text>
                    </View>
                    <Switch
                      testID={`day-toggle-${i}`}
                      value={!closed}
                      onValueChange={() => toggleDayClosed(i)}
                      trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                      thumbColor="#fff"
                    />
                  </View>
                  {!closed && (
                    <Pressable testID={`day-edit-${i}`} onPress={() => setEditDay(i)} style={styles.editBtn}>
                      <Ionicons name="create-outline" size={14} color={theme.colors.brand} />
                      <Text style={styles.editBtnText}>Modifica orari</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>CHIUSURE / APERTURE STRAORDINARIE</Text>
              <Pressable testID="add-time-off-btn" onPress={() => setNewTOOpen(true)} style={styles.addBtn}>
                <Ionicons name="add" size={16} color={theme.colors.onBrand} />
                <Text style={styles.addBtnText}>Nuovo</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>Ferie, permessi o aperture eccezionali (es. domenica aperta).</Text>
            {timeoff.length === 0 ? (
              <Text style={styles.empty}>Nessun permesso impostato.</Text>
            ) : timeoff.map((t) => (
              <View key={t.time_off_id} style={styles.toCard} testID={`timeoff-${t.time_off_id}`}>
                <View style={[styles.toIcon, { backgroundColor: t.type === "closed" ? theme.colors.danger : theme.colors.brandTertiary }]}>
                  <Ionicons name={t.type === "closed" ? "close-circle" : "add-circle"} size={22} color={t.type === "closed" ? theme.colors.error : theme.colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toType}>{t.type === "closed" ? "Chiusura" : "Apertura straordinaria"}</Text>
                  <Text style={styles.toDate}>
                    {t.date_from === t.date_to ? t.date_from : `${t.date_from} → ${t.date_to}`}
                    {t.time_from && t.time_to ? ` (${t.time_from}-${t.time_to})` : ""}
                  </Text>
                  {!!t.reason && <Text style={styles.toReason}>{t.reason}</Text>}
                </View>
                <Pressable testID={`delete-timeoff-${t.time_off_id}`} onPress={() => removeTimeOff(t.time_off_id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                </Pressable>
              </View>
            ))}
          </>
        )}
        {saving && (
          <View style={styles.savingBanner}>
            <ActivityIndicator size="small" color={theme.colors.brand} />
            <Text style={styles.savingText}>Salvataggio...</Text>
          </View>
        )}
      </ScrollView>

      {/* Edit hours modal */}
      <Modal visible={editDay !== null} transparent animationType="slide" onRequestClose={() => setEditDay(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditDay(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Orari {editDay !== null ? DAY_NAMES[editDay] : ""}</Text>
            <Text style={styles.sheetSub}>Formato HH:MM (24h). Usa 2 fasce per pausa pranzo.</Text>
            {editDay !== null && (weekly[String(editDay)] || []).map((w, wi) => (
              <View key={wi} style={styles.windowRow}>
                <Text style={styles.winLabel}>Fascia {wi + 1}</Text>
                <TextInput
                  testID={`win-${wi}-start`}
                  value={w[0]}
                  onChangeText={(v) => updateWindow(editDay, wi, 0, v)}
                  placeholder="09:00"
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  style={styles.timeInput}
                />
                <Text style={styles.dash}>→</Text>
                <TextInput
                  testID={`win-${wi}-end`}
                  value={w[1]}
                  onChangeText={(v) => updateWindow(editDay, wi, 1, v)}
                  placeholder="12:30"
                  placeholderTextColor={theme.colors.onSurfaceTertiary}
                  style={styles.timeInput}
                />
              </View>
            ))}
            <Pressable testID="save-day-hours" onPress={() => { save(weekly); setEditDay(null); }} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Salva</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New time-off modal */}
      <Modal visible={newTOOpen} transparent animationType="slide" onRequestClose={() => setNewTOOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setNewTOOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { maxHeight: "90%" }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Nuovo permesso</Text>

            <View style={styles.typeRow}>
              {(["closed", "open"] as const).map((tp) => (
                <Pressable
                  key={tp}
                  testID={`to-type-${tp}`}
                  onPress={() => setNewTO({ ...newTO, type: tp })}
                  style={[styles.typeChip, newTO.type === tp && styles.typeChipActive]}
                >
                  <Ionicons name={tp === "closed" ? "close-circle-outline" : "add-circle-outline"} size={16} color={newTO.type === tp ? theme.colors.onBrand : theme.colors.onSurface} />
                  <Text style={[styles.typeChipText, newTO.type === tp && styles.typeChipTextActive]}>{tp === "closed" ? "Chiusura" : "Apertura straordinaria"}</Text>
                </Pressable>
              ))}
            </View>

            <ScrollView>
              <Text style={styles.winLabel}>Dal - Al</Text>
              <Calendar
                testID="to-calendar"
                markingType="period"
                firstDay={1}
                minDate={new Date().toISOString().slice(0, 10)}
                onDayPress={(d: any) => {
                  if (!newTO.date_from || (newTO.date_from && newTO.date_to)) {
                    setNewTO({ ...newTO, date_from: d.dateString, date_to: d.dateString });
                  } else if (d.dateString < newTO.date_from) {
                    setNewTO({ ...newTO, date_from: d.dateString });
                  } else {
                    setNewTO({ ...newTO, date_to: d.dateString });
                  }
                }}
                markedDates={(() => {
                  if (!newTO.date_from) return {};
                  const marked: any = {};
                  const start = new Date(newTO.date_from);
                  const end = new Date(newTO.date_to || newTO.date_from);
                  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const key = d.toISOString().slice(0, 10);
                    marked[key] = { color: theme.colors.brand, textColor: theme.colors.onBrand, startingDay: key === newTO.date_from, endingDay: key === (newTO.date_to || newTO.date_from) };
                  }
                  return marked;
                })()}
                theme={{
                  backgroundColor: theme.colors.surfaceSecondary,
                  calendarBackground: theme.colors.surfaceSecondary,
                  dayTextColor: theme.colors.onSurface,
                  monthTextColor: theme.colors.onSurface,
                  textDisabledColor: theme.colors.onSurfaceTertiary,
                  arrowColor: theme.colors.brand,
                  todayTextColor: theme.colors.brand,
                  textSectionTitleColor: theme.colors.onSurfaceTertiary,
                }}
              />
              {newTO.type === "open" && (
                <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                  <TextInput testID="to-time-from" value={newTO.time_from || ""} onChangeText={(v) => setNewTO({ ...newTO, time_from: v })} placeholder="Da (10:00)" placeholderTextColor={theme.colors.onSurfaceTertiary} style={[styles.timeInput, { flex: 1 }]} />
                  <TextInput testID="to-time-to" value={newTO.time_to || ""} onChangeText={(v) => setNewTO({ ...newTO, time_to: v })} placeholder="A (13:00)" placeholderTextColor={theme.colors.onSurfaceTertiary} style={[styles.timeInput, { flex: 1 }]} />
                </View>
              )}
              <TextInput testID="to-reason" value={newTO.reason || ""} onChangeText={(v) => setNewTO({ ...newTO, reason: v })} placeholder="Motivo (es. Ferie)" placeholderTextColor={theme.colors.onSurfaceTertiary} style={[styles.timeInput, { marginTop: theme.spacing.md }]} />
            </ScrollView>

            <Pressable testID="save-time-off" onPress={addTimeOff} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Salva permesso</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 4 },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  sectionTitle: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2, marginBottom: theme.spacing.sm, fontWeight: "500", marginTop: theme.spacing.lg },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.xl },
  helperText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md, lineHeight: 18 },
  dayCard: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  dayRow: { flexDirection: "row", alignItems: "center" },
  dayName: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  dayHours: { color: theme.colors.brand, fontSize: theme.fontSize.sm, marginTop: 2 },
  editBtn: { flexDirection: "row", gap: 4, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: theme.spacing.md, paddingVertical: 6, backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.pill, marginTop: theme.spacing.sm },
  editBtnText: { color: theme.colors.brand, fontSize: theme.fontSize.sm, fontWeight: "600" },
  addBtn: { flexDirection: "row", gap: 4, backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.md, alignItems: "center" },
  addBtnText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: theme.fontSize.sm },
  toCard: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  toIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  toType: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "500" },
  toDate: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  toReason: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2, fontStyle: "italic" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md, backgroundColor: theme.colors.danger },
  empty: { color: theme.colors.onSurfaceTertiary, textAlign: "center", padding: theme.spacing.lg },
  savingBanner: { flexDirection: "row", alignSelf: "center", gap: theme.spacing.sm, alignItems: "center", padding: theme.spacing.md, marginTop: theme.spacing.md, backgroundColor: theme.colors.brandTertiary, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg },
  savingText: { color: theme.colors.brand, fontWeight: "600" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong },
  handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center" },
  sheetTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  sheetSub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  windowRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  winLabel: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, width: 70, marginTop: theme.spacing.sm },
  timeInput: { backgroundColor: theme.colors.surface, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base, borderWidth: 1, borderColor: theme.colors.border, flex: 1 },
  dash: { color: theme.colors.onSurfaceTertiary },
  saveBtn: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.md },
  saveBtnText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  typeRow: { flexDirection: "row", gap: theme.spacing.sm },
  typeChip: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  typeChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  typeChipText: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "500" },
  typeChipTextActive: { color: theme.colors.onBrand, fontWeight: "600" },
});
