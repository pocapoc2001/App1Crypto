"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage } = useT();
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-11 font-semibold"
      aria-label="Change language"
      onClick={() => setLanguage(language === "en" ? "ro" : "en")}
    >
      {language === "en" ? "RO" : "EN"}
    </Button>
  );
}
