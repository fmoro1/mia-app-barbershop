import React, { useState } from "react";
import { Modal, View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { theme } from "@/src/theme";

export default function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setErr(""); setOk(""); };

  const submit = async () => {
    setErr(""); setOk("");
    if (next.length < 6) { setErr("Nuova password troppo corta (min 6)"); return; }
    if (next !== confirm) { setErr("Le password non coincidono"); return; }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      setOk("Password aggiornata!");
      setTimeout(() => { reset(); onClose(); }, 900);
    } catch (e: any) { setErr(e.message || "Errore"); }
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet} testID="change-password-modal">
          <View style={styles.handle} />
          <Text style={styles.title}>Cambia password</Text>
          <Text style={styles.sub}>Per motivi di sicurezza, inserisci la password attuale.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Password attuale</Text>
            <TextInput testID="cp-current" value={current} onChangeText={setCurrent} secureTextEntry placeholder="••••••••" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nuova password</Text>
            <TextInput testID="cp-new" value={next} onChangeText={setNext} secureTextEntry placeholder="Almeno 6 caratteri" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Conferma nuova password</Text>
            <TextInput testID="cp-confirm" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Ripeti la nuova password" placeholderTextColor={theme.colors.onSurfaceTertiary} style={styles.input} />
          </View>

          {err ? <Text testID="cp-error" style={styles.err}>{err}</Text> : null}
          {ok ? <Text testID="cp-ok" style={styles.ok}>{ok}</Text> : null}

          <Pressable testID="cp-submit" disabled={loading} onPress={submit} style={({ pressed }) => [styles.btn, (loading || pressed) && { opacity: 0.7 }]}>
            {loading ? <ActivityIndicator color={theme.colors.onBrand} /> : <><Ionicons name="lock-closed" size={18} color={theme.colors.onBrand} /><Text style={styles.btnText}>Aggiorna password</Text></>}
          </Pressable>
          <Pressable testID="cp-cancel" onPress={() => { reset(); onClose(); }} style={{ padding: theme.spacing.md, alignItems: "center" }}>
            <Text style={{ color: theme.colors.onSurfaceTertiary }}>Annulla</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.surfaceSecondary, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, gap: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderStrong },
  handle: { width: 48, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center" },
  title: { color: theme.colors.onSurface, fontSize: theme.fontSize.xxl, fontWeight: "500" },
  sub: { color: theme.colors.onSurfaceSecondary, fontSize: theme.fontSize.base, marginBottom: theme.spacing.sm },
  field: {},
  label: { color: theme.colors.onSurfaceTertiary, fontSize: theme.fontSize.sm, letterSpacing: 1, textTransform: "uppercase", marginBottom: theme.spacing.xs },
  input: { backgroundColor: theme.colors.surface, color: theme.colors.onSurface, padding: theme.spacing.md, borderRadius: theme.radius.md, fontSize: theme.fontSize.base, borderWidth: 1, borderColor: theme.colors.border },
  err: { color: theme.colors.error, backgroundColor: theme.colors.danger, padding: theme.spacing.md, borderRadius: theme.radius.md },
  ok: { color: theme.colors.success, textAlign: "center", fontWeight: "600" },
  btn: { flexDirection: "row", gap: theme.spacing.sm, backgroundColor: theme.colors.brand, padding: theme.spacing.lg, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", marginTop: theme.spacing.sm },
  btnText: { color: theme.colors.onBrand, fontSize: theme.fontSize.lg, fontWeight: "600" },
});
