// ─── Providers & Models ───────────────────────────────────────────────────────

export type Provider = "openai" | "anthropic" | "google" | "mistral" | "cohere";

export interface Model {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;       // in tokens
  costPer1kInput: number;      // USD
  costPer1kOutput: number;     // USD
  supportsVision: boolean;
  supportsTools: boolean;
  speed: "fast" | "medium" | "slow";
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "done" | "error";
  durationMs?: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  model?: string;
  provider?: Provider;
  toolCalls?: ToolCall[];
  tokenCount?: number;
  cost?: number;
  createdAt: Date;
  streaming?: boolean;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  createdAt: Date;
  updatedAt: Date;
  totalTokens: number;
  totalCost: number;
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

export type MCPServerStatus = "connected" | "connecting" | "disconnected" | "error";
export type MCPTransport = "stdio" | "sse" | "http";
export type MCPCategory = "web" | "dev" | "data" | "productivity" | "custom";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: MCPCategory;
  transport: MCPTransport;
  url?: string;
  status: MCPServerStatus;
  tools: MCPTool[];
  enabled: boolean;
  requiresKey?: boolean;
  keyLabel?: string;
  isDefault?: boolean;
  hasKey?: boolean;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export type StreamEventType =
  | "text_delta"
  | "tool_start"
  | "tool_result"
  | "message_done"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  messageId: string;
  payload: unknown;
}

// ─── API Request / Response ───────────────────────────────────────────────────

export interface ChatRequest {
  model: string;
  messages: Array<{ role: MessageRole; content: string }>;
  tools?: MCPTool[];
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  tokenCount: number;
  cost: number;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface UIState {
  sidebarOpen: boolean;
  activePanel: "none" | "models" | "mcp" | "addKey";
  addKeyProvider: string | null;
  comparisonMode: boolean;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface UsageRecord {
  date: string;
  tokens: number;
  cost: number;
  model: string;
  provider: Provider;
}
