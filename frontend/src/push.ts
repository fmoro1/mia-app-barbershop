import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export async function registerForPush(user_id: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch (e) {
    // Push registration is best-effort. Silent fail (e.g., Expo Go).
  }
}
