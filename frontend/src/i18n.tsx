// Lightweight i18n for LendIQ — no external deps.
// Supports: English, Hindi, Tamil, Telugu, Kannada, Malayalam.
// Strings that are not translated fall back to English.
//
// Usage:
//   import { t, useI18n } from "../src/i18n";
//   const { locale, setLocale } = useI18n();
//   <Text>{t("dashboard")}</Text>

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Locale = "en" | "hi" | "ta" | "te" | "kn" | "ml";

export const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: "en", label: "English",   native: "English" },
  { code: "hi", label: "Hindi",     native: "हिन्दी" },
  { code: "ta", label: "Tamil",     native: "தமிழ்" },
  { code: "te", label: "Telugu",    native: "తెలుగు" },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
];

/* eslint-disable quotes */
const STRINGS: Record<string, Partial<Record<Locale, string>>> = {
  // ---------- Tabs ----------
  dashboard:     { en: "Dashboard",     hi: "डैशबोर्ड",     ta: "டாஷ்போர்டு",     te: "డాష్‌బోర్డ్",   kn: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", ml: "ഡാഷ്‌ബോർഡ്" },
  clients:       { en: "Clients",       hi: "ग्राहक",        ta: "வாடிக்கையாளர்கள்", te: "కస్టమర్లు",     kn: "ಗ್ರಾಹಕರು",      ml: "ക്ലയന്റുകൾ" },
  loans:         { en: "Loans",         hi: "ऋण",           ta: "கடன்கள்",         te: "రుణాలు",        kn: "ಸಾಲಗಳು",        ml: "വായ്പകൾ" },
  requests:      { en: "Requests",      hi: "अनुरोध",        ta: "கோரிக்கைகள்",     te: "అభ్యర్థనలు",    kn: "ವಿನಂತಿಗಳು",     ml: "അഭ്യർത്ഥനകൾ" },
  profile:       { en: "Profile",       hi: "प्रोफ़ाइल",      ta: "சுயவிவரம்",        te: "ప్రొఫైల్",       kn: "ಪ್ರೊಫೈಲ್",        ml: "പ്രൊഫൈൽ" },

  // ---------- Dashboard ----------
  total_outstanding: { en: "Total outstanding", hi: "कुल बकाया",   ta: "மொத்த நிலுவை",  te: "మొత్తం బకాయి",  kn: "ಒಟ್ಟು ಬಾಕಿ",     ml: "ആകെ കുടിശ്ശിക" },
  active_loans:      { en: "Active loans",      hi: "सक्रिय ऋण",   ta: "செயல்பாட்டிலுள்ள கடன்கள்", te: "యాక్టివ్ రుణాలు", kn: "ಸಕ್ರಿಯ ಸಾಲಗಳು", ml: "സജീവ വായ്പകൾ" },
  portfolio_health:  { en: "Portfolio health",  hi: "पोर्टफोलियो स्वास्थ्य", ta: "போர்ட்ஃபோலியோ நிலை", te: "పోర్ట్‌ఫోలియో ఆరోగ్యం", kn: "ಪೋರ್ಟ್‌ಫೋಲಿಯೊ ಆರೋಗ್ಯ", ml: "പോർട്ട്‌ഫോളിയോ ആരോഗ്യം" },
  on_track:          { en: "On Track",          hi: "सही रास्ते पर", ta: "சரியான பாதையில்", te: "ట్రాక్‌లో",     kn: "ಟ್ರ್ಯಾಕ್‌ನಲ್ಲಿ",   ml: "ട്രാക്കിൽ" },
  overdue:           { en: "Overdue",           hi: "अतिदेय",        ta: "நிலுவை",        te: "గడువు దాటిన",    kn: "ಬಾಕಿ",         ml: "കാലാവധി കഴിഞ്ഞത്" },
  at_risk:           { en: "At Risk",           hi: "जोखिम में",      ta: "ஆபத்தில்",       te: "ప్రమాదంలో",      kn: "ಅಪಾಯದಲ್ಲಿ",    ml: "അപകടത്തിൽ" },
  completed:         { en: "Completed",         hi: "पूर्ण",          ta: "முடிந்தது",      te: "పూర్తయింది",     kn: "ಪೂರ್ಣಗೊಂಡಿದೆ", ml: "പൂർത്തിയായി" },

  // ---------- Auth ----------
  sign_in:           { en: "Sign in",   hi: "साइन इन",  ta: "உள்நுழைக",    te: "సైన్ ఇన్",    kn: "ಸೈನ್ ಇನ್",   ml: "സൈൻ ഇൻ" },
  sign_up:           { en: "Sign up",   hi: "साइन अप",  ta: "பதிவு செய்க",  te: "సైన్ అప్",    kn: "ಸೈನ್ ಅಪ್",   ml: "സൈൻ അപ്" },
  mobile_number:     { en: "Mobile number", hi: "मोबाइल नंबर", ta: "மொபைல் எண்", te: "మొబైల్ నంబర్", kn: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ", ml: "മൊബൈൽ നമ്പർ" },
  send_otp:          { en: "Send OTP", hi: "ओटीपी भेजें", ta: "OTP அனுப்பு", te: "OTP పంపండి", kn: "OTP ಕಳುಹಿಸಿ", ml: "OTP അയയ്ക്കുക" },
  verify_continue:   { en: "Verify & continue", hi: "सत्यापित करें और आगे बढ़ें", ta: "சரிபார்த்து தொடரவும்", te: "ధృవీకరించి కొనసాగించండి", kn: "ಪರಿಶೀಲಿಸಿ ಮುಂದುವರೆಯಿರಿ", ml: "പരിശോധിച്ച് തുടരുക" },

  // ---------- Common actions ----------
  approve:           { en: "Approve",  hi: "स्वीकृत",     ta: "அங்கீகரி",     te: "ఆమోదించు",   kn: "ಅನುಮೋದಿಸಿ",   ml: "അംഗീകരിക്കുക" },
  reject:            { en: "Reject",   hi: "अस्वीकार",    ta: "நிராகரி",       te: "తిరస్కరించు",  kn: "ತಿರಸ್ಕರಿಸಿ",    ml: "നിരസിക്കുക" },
  back:              { en: "Back",     hi: "वापस",        ta: "மீண்டும்",      te: "వెనుకకు",     kn: "ಹಿಂದೆ",        ml: "തിരികെ" },
  continue_:         { en: "Continue", hi: "जारी रखें",   ta: "தொடரவும்",     te: "కొనసాగించు",  kn: "ಮುಂದುವರೆಸಿ",   ml: "തുടരുക" },
  cancel:            { en: "Cancel",   hi: "रद्द करें",    ta: "ரத்து செய்",    te: "రద్దు",       kn: "ರದ್ದುಗೊಳಿಸಿ",  ml: "റദ്ദാക്കുക" },
  save:              { en: "Save",     hi: "सहेजें",       ta: "சேமி",          te: "సేవ్",         kn: "ಉಳಿಸಿ",         ml: "സംരക്ഷിക്കുക" },
  download_pdf:      { en: "Download Report (PDF)", hi: "रिपोर्ट डाउनलोड (PDF)", ta: "அறிக்கையை பதிவிறக்கு (PDF)", te: "నివేదిక డౌన్‌లోడ్ (PDF)", kn: "ವರದಿ ಡೌನ್‌ಲೋಡ್ (PDF)", ml: "റിപ്പോർട്ട് ഡൗൺലോഡ് (PDF)" },

  // ---------- Loan ----------
  loan_request:      { en: "Loan Request", hi: "ऋण अनुरोध", ta: "கடன் கோரிக்கை", te: "రుణ అభ్యర్థన", kn: "ಸಾಲದ ವಿನಂತಿ", ml: "വായ്പാ അഭ്യർത്ഥന" },
  loan_summary:      { en: "LOAN SUMMARY", hi: "ऋण सारांश", ta: "கடன் சுருக்கம்", te: "రుణ సారాంశం", kn: "ಸಾಲದ ಸಾರಾಂಶ", ml: "വായ്പാ സംഗ്രഹം" },
  loan_amount:       { en: "Loan Amount", hi: "ऋण राशि", ta: "கடன் தொகை", te: "రుణ మొత్తం", kn: "ಸಾಲದ ಮೊತ್ತ", ml: "വായ്പാ തുക" },
  tenure:            { en: "Tenure", hi: "अवधि", ta: "காலம்", te: "కాలం", kn: "ಅವಧಿ", ml: "കാലാവധി" },
  interest_rate:     { en: "Interest rate", hi: "ब्याज दर", ta: "வட்டி விகிதம்", te: "వడ్డీ రేటు", kn: "ಬಡ್ಡಿ ದರ", ml: "പലിശ നിരക്ക്" },
  monthly_emi:       { en: "Monthly EMI", hi: "मासिक ईएमआई", ta: "மாதாந்திர EMI", te: "నెలవారీ EMI", kn: "ಮಾಸಿಕ EMI", ml: "മാസ EMI" },
  due_date:          { en: "Due date", hi: "देय तिथि", ta: "வசூல் தேதி", te: "గడువు తేదీ", kn: "ನಿಗದಿತ ದಿನಾಂಕ", ml: "അവസാന തീയതി" },
  processing_fee:    { en: "Processing fee", hi: "प्रसंस्करण शुल्क", ta: "செயலாக்க கட்டணம்", te: "ప్రాసెసింగ్ ఫీజు", kn: "ಪ್ರೊಸೆಸಿಂಗ್ ಶುಲ್ಕ", ml: "പ്രോസസ്സിംഗ് ഫീസ്" },
  net_disbursal:     { en: "Net disbursal", hi: "शुद्ध वितरण", ta: "நிகர வழங்கல்", te: "నికర పంపిణీ", kn: "ನಿವ್ವಳ ವಿತರಣೆ", ml: "നെറ്റ് വിതരണം" },
  recommended_by_ai: { en: "Recommended by AI", hi: "एआई द्वारा अनुशंसित", ta: "AI பரிந்துரைத்தது", te: "AI సిఫార్సు చేసింది", kn: "AI ಶಿಫಾರಸು", ml: "AI ശുപാർശ" },

  // ---------- Settings ----------
  language:          { en: "Language", hi: "भाषा", ta: "மொழி", te: "భాష", kn: "ಭಾಷೆ", ml: "ഭാഷ" },
  subscription:      { en: "Subscription", hi: "सदस्यता", ta: "சந்தா", te: "సభ్యత్వం", kn: "ಚಂದಾದಾರಿಕೆ", ml: "വരിസംഖ്യ" },
  settings:          { en: "Settings", hi: "सेटिंग्स", ta: "அமைப்புகள்", te: "సెట్టింగ్‌లు", kn: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", ml: "ക്രമീകരണങ്ങൾ" },
  logout:            { en: "Logout", hi: "लॉगआउट", ta: "வெளியேறு", te: "లాగ్ అవుట్", kn: "ಲಾಗ್ ಔಟ್", ml: "ലോഗ് ഔട്ട്" },

  // ---------- Subscription plans ----------
  plan_starter:      { en: "Starter",       hi: "स्टार्टर",     ta: "ஸ்டார்ட்டர்",    te: "స్టార్టర్",    kn: "ಸ್ಟಾರ್ಟರ್",   ml: "സ്റ്റാർട്ടർ" },
  plan_smart:        { en: "Smart Credit",  hi: "स्मार्ट क्रेडिट", ta: "ஸ்மார்ட் கிரெடிட்", te: "స్మార్ట్ క్రెడిట్", kn: "ಸ್ಮಾರ್ಟ್ ಕ್ರೆಡಿಟ್", ml: "സ്മാർട്ട് ക്രെഡിറ്റ്" },
  plan_prime:        { en: "Prime Elite",   hi: "प्राइम एलीट",    ta: "பிரைம் எலைட்",    te: "ప్రైమ్ ఎలైట్",    kn: "ಪ್ರೈಮ್ ಎಲೈಟ್",    ml: "പ്രൈം എലൈറ്റ്" },
  upgrade:           { en: "Upgrade",       hi: "अपग्रेड",      ta: "மேம்படுத்து",      te: "అప్‌గ్రేడ్",       kn: "ಅಪ್‌ಗ್ರೇಡ್",      ml: "അപ്ഗ്രേഡ്" },
  current_plan:      { en: "Current plan",  hi: "वर्तमान प्लान", ta: "தற்போதைய திட்டம்", te: "ప్రస్తుత ప్లాన్",  kn: "ಪ್ರಸ್ತುತ ಯೋಜನೆ",  ml: "നിലവിലെ പ്ലാൻ" },
  monthly:           { en: "Monthly",       hi: "मासिक",         ta: "மாதாந்திர",       te: "నెలవారీ",         kn: "ಮಾಸಿಕ",          ml: "പ്രതിമാസം" },
  yearly:            { en: "Yearly",        hi: "वार्षिक",        ta: "ஆண்டுதோறும்",    te: "వార్షిక",          kn: "ವಾರ್ಷಿಕ",        ml: "വാർഷികം" },
  per_month:         { en: "per month",     hi: "प्रति माह",      ta: "ஒரு மாதம்",       te: "నెలకు",            kn: "ಪ್ರತಿ ತಿಂಗಳಿಗೆ",  ml: "മാസത്തിൽ" },
  per_year:          { en: "per year",      hi: "प्रति वर्ष",     ta: "ஒரு ஆண்டுக்கு",   te: "సంవత్సరానికి",   kn: "ಪ್ರತಿ ವರ್ಷಕ್ಕೆ",   ml: "വർഷത്തിൽ" },
};
/* eslint-enable quotes */

const STORAGE_KEY = "lendiq_locale";

let currentLocale: Locale = "en";
let listeners: Array<(l: Locale) => void> = [];

export function t(key: string): string {
  const pack = STRINGS[key];
  if (!pack) return key;
  return (pack[currentLocale] as string) || (pack.en as string) || key;
}

export async function setLocale(loc: Locale) {
  currentLocale = loc;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, loc);
  } catch {}
  listeners.forEach((cb) => cb(loc));
}

export async function loadStoredLocale(): Promise<Locale> {
  try {
    const v = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
    if (v) currentLocale = v;
  } catch {}
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

// React context so UI re-renders on language change.
type Ctx = { locale: Locale; setLocale: (l: Locale) => Promise<void>; t: (k: string) => string };
const I18nContext = createContext<Ctx>({ locale: "en", setLocale: async () => {}, t });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  useEffect(() => {
    loadStoredLocale().then((l) => setLocaleState(l));
    const cb = (l: Locale) => setLocaleState(l);
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((x) => x !== cb);
    };
  }, []);

  const change = useCallback(async (l: Locale) => {
    await setLocale(l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ locale, setLocale: change, t: (k: string) => t(k) }),
    [locale, change],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
