import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Switch, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

type Client = { user_id: string; email: string; name?: string; phone?: string; must_pay_online: boolean; blacklisted: boolean };

export default function AdminClients() {
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Client | null>(null);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    try { setItems(await api.adminClients(search)); } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(q); }, [load, q]));

  const toggle = async (patch: Partial<Client>) => {
    if (!sel) return;
    try {
      const updated = await api.adminUpdateClient(sel.user_id, patch);
      setSel(updated);
      load(q);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-clients">
      <View style={styles.header}>
        <Text style={styles.tagline}>PANNELLO ADMIN</Text>
        <Text style={styles.title}>Clienti</Text>
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.onSurfaceTertiary} />
        <TextInput
          testID="clients-search"
          value={q}
          onChangeText={setQ}
          placeholder="Cerca per nome, email, telefono"
          placeholderTextColor={theme.colors.onSurfaceTertiary}
          style={styles.searchInput}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>Nessun cliente trovato</Text>
        ) : (
          items.map((c) => (
            <Pressable
              key={c.user_id}
              testID={`client-${c.user_id}`}
              onPress={() => setSel(c)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(c.name || c.email)[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name || "-"}</Text>
                <Text style={styles.email}>{c.email}</Text>
                {c.phone ? <Text style={styles.phone}>{c.phone}</Text> : null}
                <View style={styles.tags}>
                  {c.must_pay_online && <View style={[styles.tag, styles.tagGold]}><Text style={styles.tagGoldText}>Paga online</Text></View>}
                  {c.blacklisted && <View style={[styles.tag, styles.tagRed]}><Text style={styles.tagRedText}>Blacklist</Text></View>}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSel(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSel(null)} />
        <View style={styles.sheet} testID="client-sheet">
          <View style={styles.sheetHandle} />
          {sel && (
            <>
              <Text style={styles.sheetTitle}>{sel.name || sel.email}</Text>
              <Text style={styles.sheetSub}>{sel.email}</Text>
              <View style={styles.sheetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetLabel}>Pagamento obbligatorio online</Text>
                  <Text style={styles.sheetHint}>Il cliente deve pagare via Stripe alla prenotazione</Text>
                </View>
                <Switch
                  testID="client-must-pay-switch"
                  value={sel.must_pay_online}
                  onValueChange={(v) => toggle({ must_pay_online: v })}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.sheetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetLabel}>Blacklist cliente</Text>
                  <Text style={styles.sheetHint}>Il cliente non potrà più prenotare o accedere</Text>
                </View>
                <Switch
                  testID="client-blacklist-switch"
                  value={sel.blacklisted}
                  onValueChange={(v) => toggle({ blacklisted: v })}
                  trackColor={{ true: theme.colors.error, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              </View>
              <Pressable testID="client-sheet-close" onPress={() => setSel(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Chiudi</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 4 },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceSecondary, marginHorizontal: theme.spacing.xl, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  searchInput: { flex: 1, color: theme.colors.onSurface, padding: theme.spacing.md, fontSize: theme.fontSize.base },
  card: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.md, borderRadius: theme.radius.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: theme.colors.brand, fontSize: theme.fontSize.lg, fontWeight: "500" },
  name: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  email: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.sm },
  phone: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  tags: { flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xs, flexWrap: "wrap" },
  tag: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.pill },
  tagGold: { backgroundColor: theme.colors.brandTertiary },
  tagGoldText: { color: theme.colors.brand, fontSize: 10, fontWeight: "600" },
  tagRed: { backgroundColor: theme.colors.danger },
  tagRedText: { color: theme.colors.error, fontSize: 10, fontWeight: "600" },
  empty: { color: theme.colors.onSurfaceTertiary, textAlign: "center", padding: theme.spacing.xxl },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong },
  sheetHandle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center" },
  sheetTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  sheetSub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  sheetLabel: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  sheetHint: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginTop: 2 },
  closeBtn: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.md },
  closeBtnText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
