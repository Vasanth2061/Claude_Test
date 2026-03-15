# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time setup: install deps, generate Prisma client, run migrations
npm run dev          # Start dev server with Turbopack at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run all tests with Vitest
npm run db:reset     # Reset database (deletes all data)
```

To run a single test file:
```bash
npx vitest run src/path/to/__tests__/file.test.ts
```

Environment: copy `.env` and set `ANTHROPIC_API_KEY`. Without it, the app uses a mock provider that returns static demo components (Counter, Form, Card).

## Architecture

UIGen is an AI-powered React component generator. Users chat with Claude to generate and iterate on React components, which are compiled and previewed live in an iframe — no file system writes, everything is in-memory.

### Request Flow

1. User sends a message in `ChatInterface`
2. POST to `/api/chat/route.ts` with current virtual files and `projectId`
3. Server streams from Claude (or `MockLanguageModel`) via Vercel AI SDK
4. Claude uses two tools to generate/edit code:
   - `str_replace_editor` (`src/lib/tools/str-replace.ts`) — create/edit files via string replacement
   - `file_manager` (`src/lib/tools/file-manager.ts`) — create directories, delete files
5. Tool calls update the in-memory `VirtualFileSystem` via `FileSystemContext`
6. `PreviewFrame` detects file changes, runs `jsx-transformer.ts` to transpile with Babel Standalone, and renders in an iframe via `srcdoc`
7. On completion, authenticated users' projects are persisted to SQLite via Prisma

### Key Abstractions

**Virtual File System** (`src/lib/file-system.ts`)
In-memory FS with no disk I/O. Serializable to JSON for Prisma storage. Shared via `FileSystemContext`.

**JSX Transform Pipeline** (`src/lib/transform/jsx-transformer.ts`)
Compiles JSX files in-browser using Babel Standalone. Resolves `@/` imports, builds an import map, and produces executable ES modules for the preview iframe.

**Dual Context**
- `FileSystemContext` — virtual file tree state
- `ChatContext` — chat messages and streaming state

**AI Provider** (`src/lib/provider.ts`)
Returns Anthropic Claude (model: `claude-haiku`) if `ANTHROPIC_API_KEY` is set, otherwise falls back to `MockLanguageModel`. Max 40 agentic steps.

**System Prompt** (`src/lib/prompts/generation.tsx`)
Instructs Claude to: generate `/App.jsx` as the entry point, use React + Tailwind CSS, use `@/` aliases for custom files.

### Data Model (SQLite via Prisma)

```
User { id, email, password }
  └─ Project { id, name, userId?, messages: JSON, data: JSON }
```

`messages` = chat history array; `data` = serialized `VirtualFileSystem`. Projects can be anonymous (`userId = null`).

### UI Layout

Three-panel resizable layout (`src/app/main-content.tsx`):
- Left (35%): Chat interface
- Right (65%): Tabs toggling between **Preview** (iframe) and **Code** (FileTree + Monaco editor)

### Auth

JWT sessions via `jose`, stored in httpOnly cookies (7-day expiry). Passwords hashed with bcrypt. All auth logic in `src/actions/index.ts` and `src/lib/auth.ts`.

### Path Alias

`@/*` maps to `src/*` throughout the codebase.

## Coding Conventions

- **Comments:** Only add comments for genuinely complex or non-obvious logic. Skip comments for straightforward code.
- **Database models:** Always refer to `prisma/schema.prisma` as the source of truth for model definitions and relations.