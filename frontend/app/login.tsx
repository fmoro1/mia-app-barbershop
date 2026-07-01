import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";

export default function Login() {
  const { loginEmail, loginGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      await loginEmail(email.trim(), password);
      router.replace("/");
    } catch (e: any) { setErr(e.message || "Errore"); }
    setLoading(false);
  };

  const googleLogin = async () => {
    setErr(""); setLoading(true);
    try {
      const redirectUrl = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
        : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) { setLoading(false); return; }
      const url = result.url;
      const hash = url.split("#")[1] || url.split("?")[1] || "";
      const params = new URLSearchParams(hash);
      const sid = params.get("session_id");
      if (!sid) throw new Error("No session_id");
      // Resolve session_id -> profile+session_token via Emergent
      const r = await fetch("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", { headers: { "X-Session-ID": sid } });
      if (!r.ok) throw new Error("Google auth failed");
      const info = await r.json();
      await loginGoogle(info.session_token || sid);
      router.replace("/");
    } catch (e: any) { setErr(e.message || "Errore Google"); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="login-back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>
          <Text style={styles.h1}>Bentornato</Text>
          <Text style={styles.sub}>Accedi al tuo account per prenotare.</Text>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="tuo@email.com"
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                style={styles.input}
              />
            </View>
            {err ? <Text testID="login-error" style={styles.err}>{err}</Text> : null}
            <Pressable testID="login-submit-btn" onPress={submit} disabled={loading} style={({ pressed }) => [styles.btnPrimary, (pressed || loading) && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color={theme.colors.onBrand} /> : <Text style={styles.btnPrimaryText}>Accedi</Text>}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>OPPURE</Text>
              <View style={styles.line} />
            </View>

            <Pressable testID="login-google-btn" onPress={googleLogin} disabled={loading} style={({ pressed }) => [styles.btnGoogle, pressed && { opacity: 0.7 }]}>
              <Ionicons name="logo-google" size={20} color={theme.colors.onSurface} />
              <Text style={styles.btnGoogleText}>Continua con Google</Text>
            </Pressable>

            <Pressable testID="login-goto-register" onPress={() => router.push("/register")} style={{ padding: theme.spacing.md, alignItems: "center" }}>
              <Text style={{ color: theme.colors.onSurfaceSecondary }}>Non hai un account? <Text style={{ color: theme.colors.brand, fontWeight: "600" }}>Registrati</Text></Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.lg, marginLeft: -theme.spacing.sm },
  h1: { color: theme.colors.onSurface, fontSize: theme.fontSize.display, fontWeight: "500", marginBottom: theme.spacing.sm },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.lg, marginBottom: theme.spacing.xl },
  form: { gap: theme.spacing.md },
  field: {},
  label: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.sm, letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: theme.colors.surfaceSecondary, color: theme.colors.onSurface, padding: theme.spacing.lg, borderRadius: theme.radius.md, fontSize: theme.fontSize.lg, borderWidth: 1, borderColor: theme.colors.border },
  err: { color: theme.colors.error, backgroundColor: theme.colors.danger, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base },
  btnPrimary: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.sm },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
  divider: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginVertical: theme.spacing.md },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 2 },
  btnGoogle: { flexDirection: "row", gap: theme.spacing.md, backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.borderStrong },
  btnGoogleText: { color: theme.colors.onSurface, fontSize: theme.fontSize.lg, fontWeight: "500" },
});
