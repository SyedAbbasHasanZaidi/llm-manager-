"use client";
import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, disabled, size = "md" }: ToggleProps) {
  const w = size === "sm" ? 28 : 36;
  const h = size === "sm" ? 16 : 20;
  const d = size === "sm" ? 12 : 16;

  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative rounded-full border-none transition-colors duration-200 flex-shrink-0", disabled && "opacity-40 cursor-not-allowed")}
      style={{ width: w, height: h, background: checked ? "#8b5cf6" : "#3f3f3f", cursor: disabled ? "not-allowed" : "pointer", padding: 0 }}
    >
      <div
        className="absolute rounded-full bg-white transition-all duration-200"
        style={{ width: d, height: d, top: 2, left: checked ? w - d - 2 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
      />
    </button>
  );
}
