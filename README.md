# LLM Manager

A unified interface for all major LLMs with MCP (Model Context Protocol) tool support.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
├── app/                        # Next.js App Router pages & API routes
│   ├── page.tsx                # Main chat page
│   ├── dashboard/page.tsx      # Usage dashboard
│   ├── globals.css
│   ├── layout.tsx
│   └── api/
│       ├── chat/route.ts       # LLM router + streaming gateway
│       ├── mcp/
│       │   ├── servers/route.ts   # MCP server registry
│       │   └── connect/route.ts   # Connect/disconnect MCP servers
│       ├── conversations/route.ts # Conversation persistence
│       └── keys/route.ts          # API key validation
│
├── components/
│   ├── chat/                   # Chat UI (window, input, bubbles, sidebar)
│   ├── models/                 # Model selector panel
│   ├── mcp/                    # MCP server panel
│   ├── comparison/             # Side-by-side model comparison
│   ├── dashboard/              # Usage charts & stats
│   └── ui/                     # Shared primitives (Toggle, Badge, Panel)
│
├── hooks/
│   ├── useChat.ts              # Message sending + SSE streaming
│   └── useMCP.ts               # MCP server management
│
├── lib/
│   ├── models.ts               # Model registry + provider metadata
│   ├── mcp-servers.ts          # Default MCP server definitions
│   └── utils.ts                # Shared utilities
│
├── store/index.ts              # Zustand global state
└── types/index.ts              # All TypeScript types
```

## Adding a Real LLM Provider

1. Install the SDK: `npm install @anthropic-ai/sdk`
2. Open `src/app/api/chat/route.ts`
3. Uncomment the SDK code in the relevant `stream*()` function
4. Remove the stub code below it

## Adding a Real MCP Server

1. Install the SDK: `npm install @modelcontextprotocol/sdk`
2. Open `src/app/api/mcp/connect/route.ts`
3. Implement the `Client` connection using the commented example code
4. Add your server to `src/lib/mcp-servers.ts`

## Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **State**: Zustand with persistence
- **LLM SDKs**: Anthropic, OpenAI, Google Generative AI, Mistral, Cohere
- **MCP**: @modelcontextprotocol/sdk
