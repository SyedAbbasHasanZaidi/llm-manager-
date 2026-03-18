import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";
import type { Conversation, Message, MCPServer, UIState, Provider } from "@/types";
import { AVAILABLE_MODELS, getModel } from "@/lib/models";
import { DEFAULT_MCP_SERVERS } from "@/lib/mcp-servers";
import { autoTitle } from "@/lib/utils";

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface AppStore {
  // Conversations
  conversations:         Conversation[];
  activeConversationId:  string | null;
  createConversation:    (modelId: string) => string;
  setActiveConversation: (id: string | null) => void;
  deleteConversation:    (id: string) => void;
  updateTitle:           (id: string, title: string) => void;
  getActiveConversation: () => Conversation | null;

  // Messages
  addMessage:            (convId: string, msg: Message) => void;
  updateMessage:         (convId: string, msgId: string, patch: Partial<Message>) => void;
  appendContent:         (convId: string, msgId: string, delta: string) => void;
  clearMessages:         (convId: string) => void;

  // Active model
  activeModelId:         string;
  setActiveModelId:      (id: string) => void;

  // API keys — tracks which providers are connected (actual keys live in Supabase)
  apiKeys:               Record<string, boolean>;
  setApiKey:             (provider: string) => void;
  removeApiKey:          (provider: string) => void;
  getApiKey:             (provider: string) => boolean;
  setConnectedProviders: (providers: string[]) => void;

  // Pinned models
  pinnedModels:          string[];
  togglePin:             (modelId: string) => void;

  // MCP servers (cached from Supabase — source of truth is DB)
  mcpServers:            MCPServer[];
  setMCPServers:         (servers: MCPServer[]) => void;
  toggleMCPServer:       (serverId: string) => void;
  setMCPServerStatus:    (serverId: string, status: MCPServer["status"]) => void;
  addCustomMCPServer:    (server: MCPServer) => void;
  updateMCPServerKey:    (serverId: string, hasKey: boolean) => void;

  // UI
  ui:                    UIState;
  setUI:                 (patch: Partial<UIState>) => void;

  // Streaming
  streamingMsgId:        string | null;
  setStreamingMsgId:     (id: string | null) => void;

  // Usage stats (accumulated locally)
  totalTokensUsed:       number;
  totalCostUSD:          number;
  addUsage:              (tokens: number, cost: number) => void;

  // User profile
  userProfile:           { username: string; email: string; avatarUrl: string | null };
  setUserProfile:        (profile: { username: string; email: string; avatarUrl: string | null }) => void;

  // Theme
  theme:    "dark" | "light" | "mono";
  setTheme: (t: "dark" | "light" | "mono") => void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ── Conversations ────────────────────────────────────────────────────
        conversations:        [],
        activeConversationId: null,

        createConversation: (modelId) => {
          const id: string = crypto.randomUUID();
          const conv: Conversation = {
            id, title: "New conversation", messages: [],
            modelId, createdAt: new Date(), updatedAt: new Date(),
            totalTokens: 0, totalCost: 0,
          };
          set(s => ({ conversations: [conv, ...s.conversations], activeConversationId: id }));
          return id;
        },

        setActiveConversation: (id) => set({ activeConversationId: id }),

        deleteConversation: (id) => set(s => ({
          conversations:        s.conversations.filter(c => c.id !== id),
          activeConversationId: s.activeConversationId === id
            ? (s.conversations.find(c => c.id !== id)?.id ?? null)
            : s.activeConversationId,
        })),

        updateTitle: (id, title) => set(s => ({
          conversations: s.conversations.map(c => c.id === id ? { ...c, title } : c),
        })),

        getActiveConversation: () => {
          const { conversations, activeConversationId } = get();
          return conversations.find(c => c.id === activeConversationId) ?? null;
        },

        // ── Messages ─────────────────────────────────────────────────────────
        addMessage: (convId, msg) => set(s => ({
          conversations: s.conversations.map(c =>
            c.id !== convId ? c : {
              ...c,
              messages:  [...c.messages, msg],
              updatedAt: new Date(),
              // Auto-title from first user message
              title: c.messages.length === 0 && msg.role === "user"
                ? autoTitle(msg.content)
                : c.title,
            }
          ),
        })),

        updateMessage: (convId, msgId, patch) => set(s => ({
          conversations: s.conversations.map(c =>
            c.id !== convId ? c : {
              ...c,
              messages: c.messages.map(m => m.id === msgId ? { ...m, ...patch } : m),
            }
          ),
        })),

        appendContent: (convId, msgId, delta) => set(s => ({
          conversations: s.conversations.map(c =>
            c.id !== convId ? c : {
              ...c,
              messages: c.messages.map(m =>
                m.id === msgId ? { ...m, content: m.content + delta } : m
              ),
            }
          ),
        })),

        clearMessages: (convId) => set(s => ({
          conversations: s.conversations.map(c =>
            c.id === convId ? { ...c, messages: [] } : c
          ),
        })),

        // ── Model ─────────────────────────────────────────────────────────────
        activeModelId:    "claude-sonnet-4-20250514",
        setActiveModelId: (id) => set({ activeModelId: id }),

        // ── API Keys ──────────────────────────────────────────────────────────
        // Tracks connected status only — actual keys are stored encrypted in Supabase
        apiKeys:               {},
        setApiKey:             (provider)   => set(s => ({ apiKeys: { ...s.apiKeys, [provider]: true } })),
        removeApiKey:          (provider)   => set(s => { const k = { ...s.apiKeys }; delete k[provider]; return { apiKeys: k }; }),
        getApiKey:             (provider)   => get().apiKeys[provider] ?? false,
        setConnectedProviders: (providers)  => set(() => ({
          apiKeys: Object.fromEntries(providers.map(p => [p, true])),
        })),

        // ── Pins ──────────────────────────────────────────────────────────────
        pinnedModels: ["claude-sonnet-4-20250514", "gpt-4o"],
        togglePin: (modelId) => set(s => ({
          pinnedModels: s.pinnedModels.includes(modelId)
            ? s.pinnedModels.filter(id => id !== modelId)
            : [...s.pinnedModels, modelId],
        })),

        // ── MCP Servers (cached from Supabase) ────────────────────────────
        mcpServers:         DEFAULT_MCP_SERVERS,
        setMCPServers:      (servers) => set({ mcpServers: servers }),
        toggleMCPServer:    (id) => set(s => ({
          mcpServers: s.mcpServers.map(srv => srv.id === id ? { ...srv, enabled: !srv.enabled } : srv),
        })),
        setMCPServerStatus: (id, status) => set(s => ({
          mcpServers: s.mcpServers.map(srv => srv.id === id ? { ...srv, status } : srv),
        })),
        addCustomMCPServer: (server) => set(s => ({
          mcpServers: [...s.mcpServers, server],
        })),
        updateMCPServerKey: (id, hasKey) => set(s => ({
          mcpServers: s.mcpServers.map(srv => srv.id === id ? { ...srv, hasKey } : srv),
        })),

        // ── UI ────────────────────────────────────────────────────────────────
        ui: { sidebarOpen: true, activePanel: "none", addKeyProvider: null, comparisonMode: false },
        setUI: (patch) => set(s => ({ ui: { ...s.ui, ...patch } })),

        // ── Streaming ─────────────────────────────────────────────────────────
        streamingMsgId:    null,
        setStreamingMsgId: (id) => set({ streamingMsgId: id }),

        // ── Usage ─────────────────────────────────────────────────────────────
        totalTokensUsed: 0,
        totalCostUSD:    0,
        addUsage: (tokens, cost) => set(s => ({
          totalTokensUsed: s.totalTokensUsed + tokens,
          totalCostUSD:    s.totalCostUSD    + cost,
        })),

        // ── User profile ─────────────────────────────────────────────────────
        userProfile: { username: "User", email: "", avatarUrl: null },
        setUserProfile: (profile) => set({ userProfile: profile }),

        // ── Theme ─────────────────────────────────────────────────────────────
        theme:    "dark",
        setTheme: (t) => set({ theme: t }),
      }),
      {
        name: "llm-manager-v1",
        storage: createJSONStorage(() => localStorage),
        // Don't persist streaming state
        partialize: s => ({
          conversations:        s.conversations,
          activeConversationId: s.activeConversationId,
          activeModelId:        s.activeModelId,
          apiKeys:              s.apiKeys,
          pinnedModels:         s.pinnedModels,
          ui:                   s.ui,
          totalTokensUsed:      s.totalTokensUsed,
          totalCostUSD:         s.totalCostUSD,
          theme:                s.theme,
        }),
      }
    )
  )
);

// ─── Convenience selectors ────────────────────────────────────────────────────

export const useActiveConversation = () =>
  useAppStore(s => s.conversations.find(c => c.id === s.activeConversationId) ?? null);

export const useActiveModel = () =>
  useAppStore(s => getModel(s.activeModelId));

export const useConnectedProviders = () => {
  const apiKeys = useAppStore(s => s.apiKeys);
  return new Set(Object.entries(apiKeys).filter(([, connected]) => connected).map(([k]) => k as Provider));
};

export const useEnabledMCPServers = () => {
  const mcpServers = useAppStore(s => s.mcpServers);
  return mcpServers.filter(srv => srv.enabled);
};