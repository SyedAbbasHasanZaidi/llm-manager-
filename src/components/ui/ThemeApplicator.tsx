"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store";

/**
 * Reads the persisted theme from Zustand and applies it as a data-theme
 * attribute on <html>. This drives the CSS custom-property cascade defined
 * in globals.css, so every component that uses var(--bg-base) etc. responds
 * automatically without any prop drilling.
 *
 * Dependency flow:
 *   Zustand store (theme)
 *     → ThemeApplicator (useEffect)
 *       → document.documentElement.dataset.theme
 *         → CSS custom properties on :root
 *           → all components via var()
 */
export function ThemeApplicator() {
  const theme = useAppStore(s => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return null;
}
