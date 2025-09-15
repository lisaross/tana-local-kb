# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tana Local Knowledge Base transforms Tana database exports into a locally-hosted, AI-queryable knowledge system. The project preserves relationships while enabling semantic search and natural language querying through local AI models.

**Key Technologies:** Bun + TypeScript + React + Hono + tRPC + ChromaDB + Ollama + SQLite

## Essential Commands

### Development
```bash
# Start all services (most common during development)
bun run dev:all          # Starts backend, frontend, and ChromaDB concurrently

# Individual services
bun run server           # Hono backend server (port 3001)
bun run dev             # Vite frontend dev server (port 5173) 
bun run chroma          # ChromaDB Python service

# Data operations
bun run import:auto         # Watch inbox for new exports (recommended)
bun run import:replace --file ~/path/to/export.json  # Manual replace import
bun run embed           # Generate embeddings for content
bun run migrate         # Run database migrations
```

### Testing & Quality
```bash
bun test                # Run test suite (Bun native test runner)
bun run type-check      # TypeScript validation across entire project
bun run lint            # ESLint + TypeScript checks
bun run lint:fix        # Auto-fix linting issues
bun run format          # Prettier formatting
```

### Data & Debugging Tools
```bash
bun run db:inspect      # View SQLite schema and tables
bun run db:query        # Run custom SQL queries
bun run chroma:inspect  # View ChromaDB collections
bun run validate-json --file export.json  # Validate Tana JSON structure
```

## Architecture

### Monorepo Structure
- **client/**: React frontend with Vite, TanStack Router/Query, shadcn/ui
- **server/**: Bun backend with Hono web framework and tRPC APIs
- **scripts/**: Utility scripts for import, embedding, and database operations
- **data/**: Local SQLite database, ChromaDB storage, and import management (inbox/archive)

### Key Services
1. **Hono Server** (port 3001): REST API and tRPC endpoints
2. **Vite Frontend** (port 5173): React UI with proxy to backend
3. **ChromaDB Service** (port 8000): Vector database for semantic search
4. **Ollama** (port 11434): Local LLM hosting (Llama 3.2 3B)

### API Architecture
The project uses **tRPC** for end-to-end type safety between client and server. APIs are organized by feature domains (search, chat, nodes, import).

### Data Flow
1. Tana JSON → SQLite (relationships, metadata)
2. Content → ChromaDB (vector embeddings via Ollama)
3. User queries → Hybrid search (semantic + keyword + graph)
4. Results → LLM context → Natural language responses

## Development Notes

### Prerequisites Setup
Before development, ensure these services are running:
```bash
# Install and start Ollama
ollama pull llama3.2:3b
ollama pull nomic-embed-text

# Start ChromaDB (choose one)
docker run -p 8000:8000 chromadb/chroma
# OR: uv run chroma run --path ./data/chroma
```

### Frontend Development
- Uses **Vite** with React and TypeScript
- **TanStack Router**: File-based routing with type safety
- **TanStack Query**: Server state management for tRPC
- **shadcn/ui**: Modern component library
- Path aliases: `@/*` for client, `@server/*` for server

### Backend Development
- **Bun runtime**: Native TypeScript support, fast SQLite integration
- **Hono framework**: Lightweight, optimized for Bun
- **tRPC**: Type-safe APIs without code generation
- Server runs on port 3001, proxied by Vite dev server

### Data Model
Core entity is `TanaNode` containing title, content, relationships, tags, and metadata. SQLite handles graph relationships while ChromaDB stores vector embeddings for semantic search.

### Import System
The simplified import system processes Tana JSON exports:
- **Full replacement**: Each import completely replaces previous data
- **Auto-archiving**: Previous imports are automatically backed up with timestamps
- **Preserves relationships**: All Tana field structures and references maintained
- **Handles circular references**: Graceful processing of complex node relationships
- **Generates embeddings**: Automatic semantic search preparation

## Testing Strategy

- **Unit tests**: Bun's built-in test runner for utilities and business logic
- **Integration tests**: API endpoint testing with real database
- **E2E tests**: Playwright for full user workflows
- **Performance tests**: Load testing for search and import operations

Run `bun test` for unit/integration tests, `bun test:e2e` for end-to-end tests.

## Common Development Patterns

### Adding New Search Features
1. Extend tRPC router in `server/src/routers/`
2. Update client hooks in `client/src/hooks/`
3. Add UI components in appropriate feature directory
4. Test with real Tana data via import

### Working with ChromaDB
- Python service runs separately from main Bun application
- Use `bun run chroma:inspect` to view collections
- Vector operations are accessed via HTTP API from Bun server

### Database Operations
- SQLite operations use Bun's native database integration
- Migrations in `scripts/migrate.ts`
- Schema inspection via `bun run db:inspect`

## Performance Considerations

- **Target metrics**: 2000+ nodes/second import, <50ms search, <1s chat response
- **Chunking strategy**: 500 chars with 50 char overlap for embeddings
- **Batch operations**: Process embeddings in batches of 100
- **Hybrid search**: Combines semantic (0.5), keyword (0.3), graph (0.2) weights

## Troubleshooting

### Service Connection Issues
```bash
# Check ChromaDB
curl http://localhost:8000/api/v1/heartbeat

# Check Ollama models  
ollama list

# Check backend health
curl http://localhost:3001/health
```

### Import Problems
- Validate JSON structure first: `bun run validate-json`
- Run with debug logs: `DEBUG=1 bun run import:replace`
- Large imports may require increased memory limits

## Current Development Status

**Phase 1 Foundation - IN PROGRESS**
- ✅ Repository setup and basic project structure  
- ✅ Package.json with all required dependencies configured
- ✅ Basic Hono server with health check endpoint (port 3001)
- ✅ Vite configuration with proxy setup (port 5173)  
- ✅ TypeScript configuration for both client and server
- ✅ Directory structure: client/, server/, scripts/, data/
- ✅ Development scripts: dev:all, server, dev, chroma
- ⏳ **Next: Implement tRPC setup and basic API routes**

**File Structure Created:**
```
├── client/src/           # React frontend (Vite + TypeScript)
│   ├── components/       # React components
│   ├── hooks/           # Custom React hooks  
│   ├── lib/             # Utilities and config
│   └── routes/          # TanStack Router pages
├── server/src/          # Bun backend (Hono + tRPC)
│   └── index.ts         # Basic Hono server with health endpoint
├── scripts/             # Utility scripts (empty, ready for import tools)
├── data/                # Local data storage
│   ├── imports/         # Tana export management
│   ├── samples/         # Sample data for testing
│   └── {chroma}/        # ChromaDB storage
└── package.json         # All dependencies configured
```

**Ready to Start:** The foundation is complete. Next development should focus on:
1. Setting up tRPC router and basic API endpoints
2. Creating the import system for Tana JSON files
3. Database schema and SQLite integration
4. Basic React components and routing

The project has a solid foundation with all tooling configured and is ready for feature development.