import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import es from "./es.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: "es",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "cheese_language",
      caches: ["localStorage"],
    },
    // If no preference is stored in localStorage, default to Spanish
    // (navigator detection is secondary — set cheese_language in localStorage to override)
  });

// On first load, if no language is stored, force ES
if (!localStorage.getItem("cheese_language")) {
  i18n.changeLanguage("es");
}

export default i18n;

