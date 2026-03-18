import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedKey } from "@/lib/keys";
import { AVAILABLE_MODELS } from "@/lib/models";
import type { Provider } from "@/types";

export const dynamic = "force-dynamic";

// ── POST /api/title ──────────────────────────────────────────────────────────
// Generates a short conversation title from messages using the cheapest
// connected model. Returns { title: string }.

const TITLE_PROMPT = `Generate a short title (3-6 words) that summarizes the main goal of this conversation. Reply with ONLY the title, no quotes or punctuation.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages } = await req.json() as { messages: { role: string; content: string }[] };
  if (!messages?.length) return NextResponse.json({ error: "No messages" }, { status: 400 });

  // Find cheapest connected model
  const connectedProviders = new Set<Provider>();
  for (const p of ["openai", "anthropic", "google", "mistral", "cohere"] as Provider[]) {
    const key = await getDecryptedKey(user.id, p);
    if (key) connectedProviders.add(p);
  }

  if (connectedProviders.size === 0) {
    return NextResponse.json({ error: "No API keys connected" }, { status: 400 });
  }

  // Sort by input cost, pick cheapest connected
  const cheapest = AVAILABLE_MODELS
    .filter(m => connectedProviders.has(m.provider))
    .sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0];

  if (!cheapest) {
    return NextResponse.json({ error: "No model available" }, { status: 400 });
  }

  const apiKey = await getDecryptedKey(user.id, cheapest.provider);
  if (!apiKey) {
    return NextResponse.json({ error: "Key not found" }, { status: 400 });
  }

  // Truncate messages to save tokens — only send first 3 messages
  const truncated = messages.slice(0, 3).map(m => ({
    role: m.role,
    content: m.content.slice(0, 200),
  }));

  try {
    const title = await generateTitle(cheapest.provider, cheapest.id, apiKey, truncated);
    return NextResponse.json({ title });
  } catch (err) {
    console.error("Title generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

async function generateTitle(
  provider: Provider,
  modelId: string,
  apiKey: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const titleMessages = [
    ...messages,
    { role: "user", content: TITLE_PROMPT },
  ];

  switch (provider) {
    case "openai": {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });
      const res = await client.chat.completions.create({
        model: modelId,
        messages: titleMessages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        max_tokens: 20,
        temperature: 0.3,
      });
      return cleanTitle(res.choices[0]?.message?.content ?? "New conversation");
    }

    case "anthropic": {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: modelId,
        max_tokens: 20,
        messages: titleMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      });
      const block = res.content[0];
      return cleanTitle(block.type === "text" ? block.text : "New conversation");
    }

    case "google": {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelId });
      const prompt = titleMessages.map(m => `${m.role}: ${m.content}`).join("\n");
      const res = await model.generateContent(prompt);
      return cleanTitle(res.response.text());
    }

    case "mistral": {
      const { Mistral } = await import("@mistralai/mistralai");
      const client = new Mistral({ apiKey });
      const res = await client.chat.complete({
        model: modelId,
        messages: titleMessages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        maxTokens: 20,
        temperature: 0.3,
      });
      const choice = res.choices?.[0];
      const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
      return cleanTitle(content || "New conversation");
    }

    case "cohere": {
      const { CohereClientV2 } = await import("cohere-ai");
      const client = new CohereClientV2({ token: apiKey });
      const res = await client.chat({
        model: modelId,
        messages: titleMessages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        maxTokens: 20,
        temperature: 0.3,
      });
      const content = res.message?.content;
      const text = Array.isArray(content) ? content.map(c => c.type === "text" ? c.text : "").join("") : "";
      return cleanTitle(text || "New conversation");
    }

    default:
      return "New conversation";
  }
}

function cleanTitle(raw: string): string {
  // Remove quotes, trailing periods, trim
  return raw.replace(/^["']+|["']+$/g, "").replace(/\.+$/, "").trim().slice(0, 60) || "New conversation";
}
