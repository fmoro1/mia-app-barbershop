import React, { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { theme, formatCents, formatDuration } from "@/src/theme";

type Props = { visible: boolean; initialDate?: string; onClose: () => void; onCreated?: () => void };
type Service = { service_id: string; name: string; duration_minutes: number; price_cents: number };
type Slot = { start: string; end: string; available: boolean };
type Client = { user_id: string; email: string; name?: string; phone?: string };

export default function AdminNewBookingModal({ visible, initialDate, onClose, onCreated }: Props) {
  const [step, setStep] = useState<"service" | "slot" | "client">("service");
  const [services, setServices] = useState<Service[]>([]);
  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState<string>(initialDate || new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [clientMode, setClientMode] = useState<"existing" | "walkin">("walkin");
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try { setServices(await api.services()); } catch {}
    })();
    setStep("service");
    setService(null); setSlot(""); setSelectedClient(null); setWalkInName(""); setWalkInPhone(""); setErr("");
    setDate(initialDate || new Date().toISOString().slice(0, 10));
  }, [visible, initialDate]);

  const loadSlots = useCallback(async () => {
    if (!service || !date) return;
    setLoading(true);
    try {
      const r = await api.availability(date, service.service_id);
      setSlots(r.slots || []);
    } catch {}
    setLoading(false);
  }, [service, date]);

  useEffect(() => { if (step === "slot") loadSlots(); }, [step, loadSlots]);

  useEffect(() => {
    if (step !== "client" || clientMode !== "existing") return;
    (async () => {
      try { setClients(await api.adminClients(q || undefined)); } catch {}
    })();
  }, [step, clientMode, q]);

  const submit = async () => {
    setErr(""); setSubmitting(true);
    try {
      const body: any = { service_id: service!.service_id, start_at: slot };
      if (clientMode === "existing") {
        if (!selectedClient) throw new Error("Seleziona un cliente");
        body.user_id = selectedClient.user_id;
      } else {
        if (!walkInName && !walkInPhone) throw new Error("Inserisci nome o telefono");
        body.walk_in_name = walkInName || "Walk-in";
        body.walk_in_phone = walkInPhone;
      }
      await api.adminCreateBooking(body);
      onCreated?.();
      onClose();
    } catch (e: any) { setErr(e.message || "Errore"); }
    setSubmitting(false);
  };

  const next = () => {
    if (step === "service" && service) setStep("slot");
    else if (step === "slot" && slot) setStep("client");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="admin-new-booking-modal">
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Nuova prenotazione</Text>
            <Pressable testID="new-booking-close" onPress={onClose}>
              <Ionicons name="close" size={22} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.steps}>
            {["Servizio", "Data e ora", "Cliente"].map((label, i) => {
              const s = ["service", "slot", "client"][i];
              const active = step === s;
              const done = ["service", "slot", "client"].indexOf(step) > i;
              return (
                <View key={s} style={[styles.step, active && styles.stepActive]}>
                  <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
                    {done ? <Ionicons name="checkmark" size={12} color={theme.colors.onBrand} /> : <Text style={styles.stepDotText}>{i + 1}</Text>}
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
                </View>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 480 }}>
            {step === "service" && (
              <View style={{ gap: theme.spacing.sm }}>
                {services.map((s) => (
                  <Pressable
                    key={s.service_id}
                    testID={`nb-svc-${s.service_id}`}
                    onPress={() => setService(s)}
                    style={[styles.card, service?.service_id === s.service_id && styles.cardActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{s.name}</Text>
                      <Text style={styles.svcMeta}>{formatDuration(s.duration_minutes)} · {formatCents(s.price_cents)}</Text>
                    </View>
                    {service?.service_id === s.service_id && <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} />}
                  </Pressable>
                ))}
              </View>
            )}

            {step === "slot" && (
              <View>
                <View style={styles.dateStrip}>
                  {Array.from({ length: 30 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const ds = d.toISOString().slice(0, 10);
                    const sel = ds === date;
                    return (
                      <Pressable key={ds} testID={`nb-date-${ds}`} onPress={() => { setDate(ds); setSlot(""); }} style={[styles.dateChip, sel && styles.dateChipActive]}>
                        <Text style={[styles.dateChipDay, sel && styles.dateChipDayActive]}>{d.toLocaleDateString("it-IT", { weekday: "short" })}</Text>
                        <Text style={[styles.dateChipNum, sel && styles.dateChipNumActive]}>{d.getDate()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {loading ? <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.lg }} /> : (
                  <View style={styles.slotsGrid}>
                    {slots.map((s) => {
                      const label = new Date(s.start).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" });
                      const sel = slot === s.start;
                      return (
                        <Pressable key={s.start} testID={`nb-slot-${label}`} disabled={!s.available} onPress={() => setSlot(s.start)} style={[styles.slot, !s.available && styles.slotDisabled, sel && styles.slotSelected]}>
                          <Text style={[styles.slotText, !s.available && { textDecorationLine: "line-through", opacity: 0.5 }, sel && styles.slotTextSelected]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {step === "client" && (
              <View style={{ gap: theme.spacing.md }}>
                <View style={styles.tabs}>
                  <Pressable testID="mode-walkin" onPress={() => setClientMode("walkin")} style={[styles.tab, clientMode === "walkin" && styles.tabActive]}>
                    <Text style={[styles.tabText, clientMode === "walkin" && styles.tabTextActive]}>Walk-in / al telefono</Text>
                  </Pressable>
                  <Pressable testID="mode-existing" onPress={() => setClientMode("existing")} style={[styles.tab, clientMode === "existing" && styles.tabActive]}>
                    <Text style={[styles.tabText, clientMode === "existing" && styles.tabTextActive]}>Cliente registrato</Text>
                  </Pressable>
                </View>
                {clientMode === "walkin" ? (
                  <>
                    <TextInput testID="nb-name" value={walkInName} onChangeText={setWalkInName} placeholder="Nome cliente" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
                    <TextInput testID="nb-phone" value={walkInPhone} onChangeText={setWalkInPhone} placeholder="Telefono" placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="phone-pad" style={styles.input} />
                  </>
                ) : (
                  <>
                    <TextInput testID="nb-search" value={q} onChangeText={setQ} placeholder="Cerca per nome/email/telefono" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
                    <ScrollView style={{ maxHeight: 260 }}>
                      {clients.map((c) => (
                        <Pressable key={c.user_id} testID={`nb-client-${c.user_id}`} onPress={() => setSelectedClient(c)} style={[styles.card, selectedClient?.user_id === c.user_id && styles.cardActive]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.svcName}>{c.name || c.email}</Text>
                            <Text style={styles.svcMeta}>{c.email}{c.phone ? ` · ${c.phone}` : ""}</Text>
                          </View>
                          {selectedClient?.user_id === c.user_id && <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} />}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )}
              </View>
            )}
          </ScrollView>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <View style={styles.footer}>
            {step !== "service" && (
              <Pressable testID="nb-back" onPress={() => setStep(step === "client" ? "slot" : "service")} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={16} color={theme.colors.onSurface} />
                <Text style={styles.backText}>Indietro</Text>
              </Pressable>
            )}
            {step !== "client" ? (
              <Pressable testID="nb-next" disabled={step === "service" ? !service : !slot} onPress={next} style={[styles.nextBtn, ((step === "service" && !service) || (step === "slot" && !slot)) && { opacity: 0.5 }]}>
                <Text style={styles.nextBtnText}>Avanti</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.onBrand} />
              </Pressable>
            ) : (
              <Pressable testID="nb-submit" disabled={submitting} onPress={submit} style={[styles.nextBtn, submitting && { opacity: 0.6 }]}>
                {submitting ? <ActivityIndicator color={theme.colors.onBrand} /> : <><Ionicons name="checkmark" size={18} color={theme.colors.onBrand} /><Text style={styles.nextBtnText}>Conferma</Text></>}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong, maxHeight: "92%" },
  handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center", marginBottom: theme.spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  steps: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  stepActive: {},
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  stepDotActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  stepDotText: { color: theme.colors.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  stepLabel: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  stepLabelActive: { color: theme.colors.onSurface, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: theme.spacing.md, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.xs },
  cardActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandTertiary },
  svcName: { color: theme.colors.onSurface, fontSize: theme.fontSize.base, fontWeight: "500" },
  svcMeta: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 },
  dateStrip: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  dateChip: { width: 52, height: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  dateChipActive: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  dateChipDay: { color: theme.colors.onSurfaceTertiary, fontSize: 10, textTransform: "uppercase" },
  dateChipDayActive: { color: theme.colors.onBrand },
  dateChipNum: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "600" },
  dateChipNumActive: { color: theme.colors.onBrand },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  slot: { width: "23%", padding: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
  slotDisabled: { opacity: 0.3 },
  slotSelected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  slotText: { color: theme.colors.onSurface, fontSize: theme.fontSize.sm },
  slotTextSelected: { color: theme.colors.onBrand, fontWeight: "600" },
  tabs: { flexDirection: "row", gap: theme.spacing.xs, backgroundColor: theme.colors.surface, padding: 4, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  tab: { flex: 1, padding: 10, borderRadius: theme.radius.sm, alignItems: "center" },
  tabActive: { backgroundColor: theme.colors.brand },
  tabText: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.sm, fontWeight: "500" },
  tabTextActive: { color: theme.colors.onBrand, fontWeight: "600" },
  input: { backgroundColor: theme.colors.surface, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base, borderWidth: 1, borderColor: theme.colors.border },
  err: { color: theme.colors.error, backgroundColor: theme.colors.danger, padding: theme.spacing.sm, borderRadius: theme.radius.md, marginTop: theme.spacing.sm, textAlign: "center" },
  footer: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  backBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 4 },
  backText: { color: theme.colors.onSurface, fontWeight: "500" },
  nextBtn: { flex: 1, flexDirection: "row", gap: 4, backgroundColor: theme.colors.brand, padding: theme.spacing.md, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
  nextBtnText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
