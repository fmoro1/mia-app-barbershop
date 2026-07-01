import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { theme, formatCents, formatDuration } from "@/src/theme";

type Service = { service_id: string; name: string; description?: string; duration_minutes: number; price_cents: number; deposit_percent: number; active: boolean };

const empty: Partial<Service> = { name: "", description: "", duration_minutes: 30, price_cents: 2000, deposit_percent: 0, active: true };

export default function AdminServices() {
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.services()); } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!edit) return;
    const payload = {
      name: edit.name,
      description: edit.description || "",
      duration_minutes: Number(edit.duration_minutes),
      price_cents: Number(edit.price_cents),
      deposit_percent: Number(edit.deposit_percent),
      active: edit.active !== false,
    };
    try {
      if (edit.service_id) await api.adminUpdateService(edit.service_id, payload);
      else await api.adminCreateService(payload);
      setEdit(null); load();
    } catch {}
  };

  const del = async (id: string) => {
    try { await api.adminDeleteService(id); load(); } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-services">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tagline}>PANNELLO ADMIN</Text>
          <Text style={styles.title}>Servizi</Text>
        </View>
        <Pressable testID="new-service-btn" onPress={() => setEdit({ ...empty })} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={theme.colors.onBrand} />
          <Text style={styles.addBtnText}>Nuovo</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
        ) : items.map((s) => (
          <View key={s.service_id} style={styles.card} testID={`service-${s.service_id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.name}</Text>
              {!!s.description && <Text style={styles.desc}>{s.description}</Text>}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{formatDuration(s.duration_minutes)}</Text>
                <Text style={styles.metaPrice}>{formatCents(s.price_cents)}</Text>
                {s.deposit_percent > 0 && <Text style={styles.metaDeposit}>Acconto {s.deposit_percent}%</Text>}
              </View>
            </View>
            <Pressable testID={`edit-service-${s.service_id}`} onPress={() => setEdit({ ...s })} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={20} color={theme.colors.brand} />
            </Pressable>
            <Pressable testID={`delete-service-${s.service_id}`} onPress={() => del(s.service_id)} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!edit} animationType="slide" transparent onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEdit(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet} testID="service-editor">
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{edit?.service_id ? "Modifica servizio" : "Nuovo servizio"}</Text>
            <TextInput testID="svc-name" value={edit?.name} onChangeText={(v) => setEdit({ ...edit, name: v })} placeholder="Nome" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            <TextInput testID="svc-desc" value={edit?.description} onChangeText={(v) => setEdit({ ...edit, description: v })} placeholder="Descrizione" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <TextInput testID="svc-duration" value={String(edit?.duration_minutes || "")} onChangeText={(v) => setEdit({ ...edit, duration_minutes: v })} placeholder="Durata (min)" placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
              <TextInput testID="svc-price" value={String(edit?.price_cents || "")} onChangeText={(v) => setEdit({ ...edit, price_cents: v })} placeholder="Prezzo (cent €)" placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
            </View>
            <TextInput testID="svc-deposit" value={String(edit?.deposit_percent || 0)} onChangeText={(v) => setEdit({ ...edit, deposit_percent: v })} placeholder="Acconto %" placeholderTextColor={theme.colors.onSurfaceTertiary} keyboardType="numeric" style={styles.input} />
            <Text style={styles.helperText}>Prezzo in centesimi: 20€ = 2000. Acconto &gt; 0 richiede pagamento online.</Text>
            <Pressable testID="svc-save" onPress={save} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Salva</Text>
            </Pressable>
            <Pressable testID="svc-cancel" onPress={() => setEdit(null)} style={{ padding: theme.spacing.md, alignItems: "center" }}>
              <Text style={{ color: theme.colors.onSurfaceTertiary }}>Annulla</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 4 },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  addBtn: { flexDirection: "row", gap: theme.spacing.xs, backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, alignItems: "center" },
  addBtnText: { color: theme.colors.onBrand, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  name: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  desc: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm },
  meta: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  metaPrice: { color: theme.colors.brand, fontSize: theme.fontSize.base, fontWeight: "600" },
  metaDeposit: { color: theme.colors.warning, fontSize: 11, fontWeight: "600" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceTertiary },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong },
  sheetHandle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center" },
  sheetTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  input: { backgroundColor: theme.colors.surface, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base, borderWidth: 1, borderColor: theme.colors.border },
  helperText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  saveBtn: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.sm },
  saveBtnText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
