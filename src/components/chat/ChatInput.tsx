"use client";
import { useRef, KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, onStop, isStreaming, placeholder, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  return (
    <div style={{ background: "#2f2f2f", border: "1px solid #3f3f3f", borderRadius: 16, position: "relative" }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => { onChange(e.target.value); handleInput(); }}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder={placeholder ?? "Message…"}
        rows={1}
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          color: "#ececec", fontSize: 15, padding: "13px 52px 13px 16px",
          lineHeight: 1.6, minHeight: 52, maxHeight: 200,
          caretColor: "#8b5cf6", resize: "none",
        }}
      />
      <div style={{ position: "absolute", right: 10, bottom: 9 }}>
        {isStreaming ? (
          <button
            onClick={onStop}
            style={{ width: 32, height: 32, borderRadius: 8, background: "#ececec", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            title="Stop generating"
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#212121", display: "inline-block" }} />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: canSend ? "#8b5cf6" : "#3f3f3f",
              border: "none", display: "flex", alignItems: "center",
              justifyContent: "center",
              cursor: canSend ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
            title="Send (Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={canSend ? "white" : "#6b7280"} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
