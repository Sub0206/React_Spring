import { Platform, Alert, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { getToken } from "./api";

/**
 * One-click PDF "download" helper — no share sheet, no app chooser.
 *
 *   Web:     fetch with Bearer → Blob → anchor with `download="<file>"`.
 *            If the initial fetch fails, open the tokenised URL in a new tab
 *            (browsers handle the PDF natively with a proper filename).
 *
 *   Native:  1. download to cache with expo-file-system (auth header attached)
 *            2. if StorageAccessFramework is available (Android 11+), let the
 *               user pick a folder ONCE and copy the file there.
 *            3. otherwise / iOS: open the PDF in the system browser via
 *               `WebBrowser.openBrowserAsync` using a tokenised URL — this
 *               does NOT trigger the share/app-chooser sheet; the OS shows
 *               the PDF and exposes "Save to Files" / the standard download
 *               menu of the browser.
 *
 * The backend accepts `?token=<jwt>` so the native browser fallback works
 * without headers.
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
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(href);
        a.remove();
      }, 600);
      return;
    } catch (e) {
      try {
        window.open(urlWithToken, "_blank");
        return;
      } catch {
        throw e;
      }
    }
  }

  // ===== NATIVE =====
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const target = `${dir}${safeName}`;

  let downloadedUri: string | null = null;
  try {
    const res = await FileSystem.downloadAsync(url, target, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) downloadedUri = res.uri;
  } catch {
    // ignore — we'll fall back to WebBrowser below
  }

  // 1. Android 11+: try Storage Access Framework for a real "save to Downloads"
  if (
    downloadedUri &&
    Platform.OS === "android" &&
    (FileSystem as any).StorageAccessFramework
  ) {
    try {
      const SAF = (FileSystem as any).StorageAccessFramework;
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (perm.granted) {
        const b64 = await FileSystem.readAsStringAsync(downloadedUri, { encoding: "base64" as any });
        const newUri = await SAF.createFileAsync(perm.directoryUri, safeName, "application/pdf");
        await FileSystem.writeAsStringAsync(newUri, b64, { encoding: "base64" as any });
        Alert.alert("Saved", `Saved ${safeName} to the selected folder.`);
        return;
      }
    } catch {
      // fall through to browser fallback
    }
  }

  // 2. iOS / fallback: open the tokenised URL in the OS browser. The browser
  //    shows the PDF inline and provides its own "Download" / "Save to Files"
  //    control — no share/app-chooser sheet appears.
  try {
    await WebBrowser.openBrowserAsync(urlWithToken, { showTitle: false });
    return;
  } catch {
    try {
      const can = await Linking.canOpenURL(urlWithToken);
      if (can) {
        await Linking.openURL(urlWithToken);
        return;
      }
    } catch {
      // nothing
    }
  }

  if (downloadedUri) {
    Alert.alert("Saved", `PDF saved to app storage at ${downloadedUri}`);
  } else {
    Alert.alert("Download failed", "Could not download the PDF. Please try again.");
  }
}
