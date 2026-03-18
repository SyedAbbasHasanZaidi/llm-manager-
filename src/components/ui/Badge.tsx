"use client";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "purple" | "green" | "amber" | "red" | "muted";
  size?: "sm" | "xs";
}

const VARIANTS = {
  default: "bg-[#2f2f2f] text-[#acacac] border-[#3f3f3f]",
  purple:  "bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] border-[rgba(139,92,246,0.2)]",
  green:   "bg-[rgba(16,185,129,0.08)] text-[#6ee7b7] border-[rgba(16,185,129,0.15)]",
  amber:   "bg-[rgba(245,158,11,0.1)] text-[#fcd34d] border-[rgba(245,158,11,0.2)]",
  red:     "bg-[rgba(239,68,68,0.1)] text-[#f87171] border-[rgba(239,68,68,0.2)]",
  muted:   "bg-transparent text-[#4b5563] border-[#2a2a2a]",
};

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded border font-medium",
      size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
      VARIANTS[variant]
    )}>
      {children}
    </span>
  );
}
