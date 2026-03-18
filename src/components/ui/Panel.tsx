"use client";
import { cn } from "@/lib/utils";

interface PanelProps {
  children: React.ReactNode;
  width?: number;
  className?: string;
}

export function Panel({ children, width = 300, className }: PanelProps) {
  return (
    <div
      className={cn("flex flex-col flex-shrink-0 h-full", className)}
      style={{
        width,
        background: "#171717",
        borderLeft: "1px solid #2f2f2f",
      }}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #2f2f2f" }}>
      {children}
    </div>
  );
}

export function PanelBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}
