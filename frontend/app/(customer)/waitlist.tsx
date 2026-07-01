import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

type WLItem = { waitlist_id: string; service_name: string; desired_date: string; notified: boolean };

export default function Waitlist() {
  const [items, setItems] = useState<WLItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.myWaitlist()); } catch {}
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const leave = async (id: string) => {
    try { await api.leaveWaitlist(id); load(); } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="waitlist-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Lista d'attesa</Text>
        <Text style={styles.sub}>Riceverai una notifica quando si libera un posto</Text>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}>
        {loading ? (
          <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={theme.colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Non sei in lista d'attesa</Text>
            <Text style={styles.emptySub}>Se una data è piena, potrai iscriverti dalla schermata di prenotazione</Text>
          </View>
        ) : (
          <View style={{ padding: theme.spacing.xl }}>
            {items.map((w) => (
              <View key={w.waitlist_id} testID={`waitlist-${w.waitlist_id}`} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{w.service_name}</Text>
                  <Text style={styles.date}>Data desiderata: {new Date(w.desired_date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</Text>
                  {w.notified ? (
                    <View style={styles.notifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                      <Text style={styles.notifiedText}>Posto libero! Prenota ora</Text>
                    </View>
                  ) : (
                    <View style={styles.waitingBadge}>
                      <Ionicons name="hourglass-outline" size={14} color={theme.colors.onSurfaceTertiary} />
                      <Text style={styles.waitingText}>In attesa</Text>
                    </View>
                  )}
                </View>
                <Pressable testID={`leave-${w.waitlist_id}`} onPress={() => leave(w.waitlist_id)} style={styles.iconBtn}>
                  <Ionicons name="close" size={20} color={theme.colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { padding: theme.spacing.xl, paddingBottom: theme.spacing.md },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxxl, fontWeight: "500" },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base, marginTop: theme.spacing.xs },
  card: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  name: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500", marginBottom: 4 },
  date: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base, marginBottom: theme.spacing.sm },
  notifiedBadge: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: 4, backgroundColor: "rgba(134,239,172,0.1)", borderRadius: theme.radius.pill, alignSelf: "flex-start" },
  notifiedText: { color: theme.colors.success, fontSize: theme.fontSize.sm, fontWeight: "600" },
  waitingBadge: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: theme.spacing.md, paddingVertical: 4, backgroundColor: theme.colors.surfaceTertiary, borderRadius: theme.radius.pill, alignSelf: "flex-start" },
  waitingText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm },
  iconBtn: { width: 40, height: 40, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.danger },
  empty: { alignItems: "center", padding: theme.spacing.xxxl, gap: theme.spacing.md },
  emptyText: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
  emptySub: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base, textAlign: "center" },
});
