import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Platform, Share } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { theme, formatCents, formatDuration } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2OTV8MHwxfHNlYXJjaHwxfHxoaWdoJTIwZW5kJTIwYmFyYmVyc2hvcCUyMGludGVyaW9yJTIwZGFyayUyMHdvb2QlMjB3YXJtJTIwbGlnaHRpbmd8ZW58MHx8fHwxNzgyOTMzMDY4fDA&ixlib=rb-4.1.0&q=85";

type Service = {
  service_id: string; name: string; description?: string;
  duration_minutes: number; price_cents: number; deposit_percent: number;
};

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setServices(await api.services()); } catch {}
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSelect = (s: Service) => {
    if (!user) { router.push("/login"); return; }
    router.push({ pathname: "/(customer)/book", params: { service_id: s.service_id, service_name: s.name, duration: String(s.duration_minutes), price: String(s.price_cents) } });
  };

  const shareLink = async () => {
    const url = process.env.EXPO_PUBLIC_BACKEND_URL || "";
    try {
      await Share.share({ message: `Prenota da noi: ${url}`, url });
    } catch {}
  };

  return (
    <View style={styles.container} testID="customer-home">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brand} />}
      >
        <View style={styles.hero}>
          <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
            <View style={styles.heroContent}>
              <View style={styles.headerRow}>
                <Image source={require("../../assets/images/logo-white.png")} style={styles.brandLogo} contentFit="contain" />
                <Pressable testID="home-share-btn" onPress={shareLink} style={styles.iconBtn}>
                  <Ionicons name="share-social-outline" size={22} color={theme.colors.brand} />
                </Pressable>
              </View>
              <Text style={styles.heroTitle}>Prenota{"\n"}il tuo look</Text>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>I nostri servizi</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.brand} style={{ marginTop: theme.spacing.xxl }} />
          ) : services.length === 0 ? (
            <Text style={styles.empty}>Nessun servizio disponibile.</Text>
          ) : (
            services.map((s) => (
              <Pressable
                key={s.service_id}
                testID={`service-card-${s.service_id}`}
                onPress={() => onSelect(s)}
                style={({ pressed }) => [styles.serviceCard, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="cut" size={22} color={theme.colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  {!!s.description && <Text style={styles.serviceDesc} numberOfLines={2}>{s.description}</Text>}
                  <View style={styles.serviceMetaRow}>
                    <View style={styles.metaChip}>
                      <Ionicons name="time-outline" size={12} color={theme.colors.onSurfaceTertiary} />
                      <Text style={styles.metaText}>{formatDuration(s.duration_minutes)}</Text>
                    </View>
                    <Text style={styles.price}>{formatCents(s.price_cents)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceTertiary} />
              </Pressable>
            ))
          )}
        </View>
        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  hero: { height: 320, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  heroContent: { flex: 1, padding: theme.spacing.xl, justifyContent: "space-between" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandLogo: { width: 220, height: 90 },
  tagline: { color: theme.colors.brand, letterSpacing: 3, fontSize: 11, fontWeight: "500", marginBottom: 6 },
  brandName: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  iconBtn: { width: 40, height: 40, borderRadius: theme.radius.pill, backgroundColor: "rgba(200,155,60,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.borderStrong },
  heroTitle: { color: theme.colors.onSurface, fontSize: 44, fontWeight: "500", lineHeight: 48 },
  section: { padding: theme.spacing.xl },
  sectionTitle: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500", marginBottom: theme.spacing.lg },
  serviceCard: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  iconWrap: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  serviceName: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500", marginBottom: 4 },
  serviceDesc: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.base, marginBottom: theme.spacing.sm },
  serviceMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.surfaceTertiary, paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.pill },
  metaText: { color: theme.colors.onSurfaceTertiary, fontSize: 11 },
  price: { color: theme.colors.brand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  empty: { color: theme.colors.onSurfaceTertiary, textAlign: "center", padding: theme.spacing.xxl },
});
