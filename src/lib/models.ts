import type { Model, Provider } from "@/types";

export const AVAILABLE_MODELS: Model[] = [
  // ── Anthropic
  { id: "claude-opus-4-6",           name: "Claude Opus 4.6",    provider: "anthropic", contextWindow: 200000, costPer1kInput: 0.015,   costPer1kOutput: 0.075,  supportsVision: true,  supportsTools: true,  speed: "slow"   },
  { id: "claude-sonnet-4-20250514",  name: "Claude Sonnet 4",    provider: "anthropic", contextWindow: 200000, costPer1kInput: 0.003,   costPer1kOutput: 0.015,  supportsVision: true,  supportsTools: true,  speed: "medium" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",   provider: "anthropic", contextWindow: 200000, costPer1kInput: 0.00025, costPer1kOutput: 0.00125,supportsVision: true,  supportsTools: true,  speed: "fast"   },
  // ── OpenAI
  { id: "gpt-4o",                    name: "GPT-4o",             provider: "openai",    contextWindow: 128000, costPer1kInput: 0.005,   costPer1kOutput: 0.015,  supportsVision: true,  supportsTools: true,  speed: "medium" },
  { id: "gpt-4o-mini",               name: "GPT-4o mini",        provider: "openai",    contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsVision: true,  supportsTools: true,  speed: "fast"   },
  { id: "o3",                        name: "o3",                  provider: "openai",    contextWindow: 200000, costPer1kInput: 0.01,    costPer1kOutput: 0.04,   supportsVision: true,  supportsTools: true,  speed: "slow"   },
  { id: "o4-mini",                   name: "o4-mini",             provider: "openai",    contextWindow: 200000, costPer1kInput: 0.0011,  costPer1kOutput: 0.0044, supportsVision: false, supportsTools: true,  speed: "fast"   },
  // ── Google
  { id: "gemini-2.0-flash",          name: "Gemini 2.0 Flash",   provider: "google",    contextWindow: 1000000,costPer1kInput: 0.0001,  costPer1kOutput: 0.0004, supportsVision: true,  supportsTools: true,  speed: "fast"   },
  { id: "gemini-2.0-pro",            name: "Gemini 2.0 Pro",     provider: "google",    contextWindow: 1000000,costPer1kInput: 0.00125, costPer1kOutput: 0.005,  supportsVision: true,  supportsTools: true,  speed: "medium" },
  // ── Mistral
  { id: "mistral-large-latest",      name: "Mistral Large",      provider: "mistral",   contextWindow: 128000, costPer1kInput: 0.002,   costPer1kOutput: 0.006,  supportsVision: false, supportsTools: true,  speed: "medium" },
  { id: "mistral-small-latest",      name: "Mistral Small",      provider: "mistral",   contextWindow: 32000,  costPer1kInput: 0.0002,  costPer1kOutput: 0.0006, supportsVision: false, supportsTools: true,  speed: "fast"   },
  { id: "codestral-latest",          name: "Codestral",          provider: "mistral",   contextWindow: 256000, costPer1kInput: 0.0003,  costPer1kOutput: 0.0009, supportsVision: false, supportsTools: true,  speed: "fast"   },
  // ── Cohere
  { id: "command-r-plus-08-2024",    name: "Command R+",         provider: "cohere",    contextWindow: 128000, costPer1kInput: 0.003,   costPer1kOutput: 0.015,  supportsVision: false, supportsTools: true,  speed: "medium" },
  { id: "command-r-08-2024",         name: "Command R",          provider: "cohere",    contextWindow: 128000, costPer1kInput: 0.0005,  costPer1kOutput: 0.0015, supportsVision: false, supportsTools: true,  speed: "fast"   },
];

export const PROVIDER_META: Record<Provider, { label: string; color: string; keyPrefix: string; keyPlaceholder: string; docsUrl: string }> = {
  anthropic: { label: "Anthropic", color: "#d4a76a", keyPrefix: "sk-ant-",  keyPlaceholder: "sk-ant-api03-...",              docsUrl: "https://console.anthropic.com/settings/keys"   },
  openai:    { label: "OpenAI",    color: "#74c69d", keyPrefix: "sk-",       keyPlaceholder: "sk-proj-...",                   docsUrl: "https://platform.openai.com/api-keys"          },
  google:    { label: "Google",    color: "#6fa8dc", keyPrefix: "AIza",      keyPlaceholder: "AIzaSy...",                     docsUrl: "https://aistudio.google.com/apikey"            },
  mistral:   { label: "Mistral",   color: "#a78bfa", keyPrefix: "",          keyPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxx",  docsUrl: "https://console.mistral.ai/api-keys"          },
  cohere:    { label: "Cohere",    color: "#fb8c6b", keyPrefix: "",          keyPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",docsUrl: "https://dashboard.cohere.com/api-keys"       },
};

export const PROVIDER_ORDER: Provider[] = ["anthropic", "openai", "google", "mistral", "cohere"];

export function getModel(id: string): Model | undefined {
  return AVAILABLE_MODELS.find(m => m.id === id);
}

export function getModelsByProvider(provider: Provider): Model[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider);
}

export function groupModelsByProvider(): Record<Provider, Model[]> {
  const grouped = {} as Record<Provider, Model[]>;
  for (const m of AVAILABLE_MODELS) {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  }
  return grouped;
}

/** Cheapest model that supports the required capabilities */
export function selectCheapestModel(opts: { vision?: boolean; tools?: boolean; minCtx?: number } = {}): Model {
  const candidates = AVAILABLE_MODELS.filter(m => {
    if (opts.vision && !m.supportsVision) return false;
    if (opts.tools  && !m.supportsTools)  return false;
    if (opts.minCtx && m.contextWindow < opts.minCtx) return false;
    return true;
  });
  return candidates.sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0] ?? AVAILABLE_MODELS[0];
}
