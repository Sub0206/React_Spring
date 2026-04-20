import { Platform, Alert, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { getToken } from "./api";

/**
 * Download + open a PDF from the given backend path with bullet-proof fallbacks.
 *
 *   Native:  (1) fetch with Bearer → save to cache → native share/preview sheet
 *            (2) if that fails → WebBrowser.openBrowserAsync(url?token=)
 *            (3) if that fails → Linking.openURL
 *   Web:     (1) fetch with Bearer → Blob → <a download>
 *            (2) if that fails → window.open(url?token=) so the browser handles it
 *
 * The backend exposes `?token=` as a query-param auth fallback for the cases
 * where the share-sheet / browser can't attach an Authorization header.
 */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL as string) || "";
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const token = (await getToken()) || "";
  const sep = url.includes("?") ? "&" : "?";
  const urlWithToken = `${url}${sep}token=${encodeURIComponent(token)}`;
  const safeName = filename
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-]/g, "");

  // ===== WEB =====
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = safeName;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(href);
        a.remove();
      }, 800);
      return;
    } catch (e) {
      // Fallback: let the browser open it directly with ?token=
      try {
        window.open(urlWithToken, "_blank");
        return;
      } catch {
        throw e;
      }
    }
  }

  // ===== NATIVE (iOS / Android) =====
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const target = `${dir}${safeName}`;

  let downloadedUri: string | null = null;
  try {
    const res = await FileSystem.downloadAsync(url, target, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) {
      downloadedUri = res.uri;
    }
  } catch (e) {
    // swallow — we'll fall back below
  }

  if (downloadedUri) {
    // Try native share/preview sheet first
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadedUri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Save or open PDF report",
        });
        return;
      }
    } catch {
      // fall through
    }
    // Fallback: open the downloaded file via OS
    try {
      await WebBrowser.openBrowserAsync(downloadedUri);
      return;
    } catch {
      // fall through
    }
  }

  // Final fallback: force the OS browser to open the tokenised URL.
  try {
    await WebBrowser.openBrowserAsync(urlWithToken);
    return;
  } catch {
    try {
      const supported = await Linking.canOpenURL(urlWithToken);
      if (supported) {
        await Linking.openURL(urlWithToken);
        return;
      }
    } catch {
      // nothing
    }
  }

  Alert.alert(
    "Download failed",
    "Could not open PDF. Please check your connection and try again.",
  );
}
