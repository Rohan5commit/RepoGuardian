"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useState } from "react";

import { THEME_COOKIE_NAME } from "@/lib/constants";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light",
  );

  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      className="surface-muted inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5"
      aria-label={`Switch to ${nextTheme} mode`}
    >
      {theme === "light" ? <MoonStar size={16} /> : <SunMedium size={16} />}
      {theme === "light" ? "Dark Mode" : "Light Mode"}
    </button>
  );
}
