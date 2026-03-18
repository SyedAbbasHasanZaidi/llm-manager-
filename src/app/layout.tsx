import type { Metadata } from "next";
import { StoreProvider } from "@/components/ui/StoreProvider";
import { ThemeApplicator } from "@/components/ui/ThemeApplicator";
import "./globals.css";

export const metadata: Metadata = {
  title:       "LLM Manager",
  description: "Unified interface for all LLMs with MCP tool support",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "var(--bg-base)" }}>
        <StoreProvider>
          {/* Syncs persisted theme from Zustand → data-theme on <html> */}
          <ThemeApplicator />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}