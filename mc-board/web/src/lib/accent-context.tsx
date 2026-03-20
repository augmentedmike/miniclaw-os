"use client";
import { createContext, useContext } from "react";

const DEFAULT_ACCENT = "#00E5CC";

export const AccentContext = createContext<string>(DEFAULT_ACCENT);

export function useAccent(): string {
  return useContext(AccentContext);
}

/** Convert hex to RGB components for use in rgba() */
export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
