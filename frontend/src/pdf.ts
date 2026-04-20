import { Platform, Alert } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Download a PDF from the given absolute backend path (must start with "/api/").
 * Works on:
 *  - Web: fetches with Bearer token, creates a Blob, triggers a browser download.
 *  - Native (iOS/Android): uses expo-file-system.downloadAsync with Authorization
 *    header, then opens the system share sheet (Sharing.shareAsync) so the user
 *    can preview / save / forward. Falls back to expo-web-browser if sharing
 *    is unavailable.
 *
 * `filename` is used for both the saved file on disk and the browser download.
 */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL as string) || "";
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const token = (await AsyncStorage.getItem("access_token")) || "";
  const safeName = filename.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.\-]/g, "");

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Download failed (${r.status})`);
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(href);
      a.remove();
    }, 500);
    return;
  }

  // Native: stream-download to a cache file, then share/open it.
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const target = `${dir}${safeName}`;
  const res = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`Download failed (${res.status})`);
  }

  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(res.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Save or open PDF report",
      });
      return;
    }
  } catch (e) {
    // Fall through to web-browser fallback.
  }

  // Last-resort fallback: open in the system browser (sans auth header).
  try {
    await WebBrowser.openBrowserAsync(res.uri);
  } catch (e: any) {
    Alert.alert("PDF saved", `Saved to ${res.uri}`);
  }
}
