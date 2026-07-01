import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { theme } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr("");
    if (password.length < 6) { setErr("Password troppo corta (min 6)"); return; }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim(), phone.trim() || undefined);
      router.replace("/");
    } catch (e: any) { setErr(e.message || "Errore"); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable testID="register-back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
          </Pressable>
          <Text style={styles.h1}>Crea account</Text>
          <Text style={styles.sub}>Un unico account per prenotare più velocemente.</Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Nome completo</Text>
              <TextInput testID="register-name-input" value={name} onChangeText={setName} placeholder="Mario Rossi" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            </View>
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput testID="register-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="tuo@email.com" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            </View>
            <View>
              <Text style={styles.label}>Telefono (opzionale)</Text>
              <TextInput testID="register-phone-input" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+39 333 1234567" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            </View>
            <View>
              <Text style={styles.label}>Password</Text>
              <TextInput testID="register-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="Almeno 6 caratteri" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
            </View>
            {err ? <Text testID="register-error" style={styles.err}>{err}</Text> : null}
            <Pressable testID="register-submit-btn" onPress={submit} disabled={loading} style={({ pressed }) => [styles.btnPrimary, (pressed || loading) && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color={theme.colors.onBrand} /> : <Text style={styles.btnPrimaryText}>Registrati</Text>}
            </Pressable>
            <Pressable testID="register-goto-login" onPress={() => router.replace("/login")} style={{ padding: theme.spacing.md, alignItems: "center" }}>
              <Text style={{ color: theme.colors.onSurfaceSecondary }}>Hai già un account? <Text style={{ color: theme.colors.brand, fontWeight: "600" }}>Accedi</Text></Text>
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
  label: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.sm, letterSpacing: 1, textTransform: "uppercase" },
  input: { backgroundColor: theme.colors.surfaceSecondary, color: theme.colors.onSurface, padding: theme.spacing.lg, borderRadius: theme.radius.md, fontSize: theme.fontSize.lg, borderWidth: 1, borderColor: theme.colors.border },
  err: { color: theme.colors.error, backgroundColor: theme.colors.danger, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base },
  btnPrimary: { backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.sm },
  btnPrimaryText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
