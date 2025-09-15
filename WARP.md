# WARP.md - Tana Local Knowledge Base

## Project Overview

Transform your Tana database into a locally-hosted, AI-queryable knowledge system that preserves relationships while enabling semantic search and natural language querying.

**Status:** 🚧 Foundation Complete - Building Core Features  
**Repository:** https://github.com/lisaross/tana-local-kb  
**Stack:** Bun + TypeScript + React + Hono + tRPC + ChromaDB + Ollama + SQLite

## Quick Start (15 Minutes)

### Prerequisites
- [Bun](https://bun.sh) runtime
- [Ollama](https://ollama.ai) for local LLM
- [Docker](https://docker.com) for ChromaDB (or Python with uv)
- Your Tana JSON export

### Setup Commands
```bash
# 1. Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# 2. Clone and install dependencies
git clone https://github.com/lisaross/tana-local-kb.git
cd tana-local-kb
bun install

# 3. Setup Python environment for ChromaDB
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate
uv pip install chromadb fastapi uvicorn

# 4. Start Ollama and pull models
ollama pull llama3.2:3b
ollama pull nomic-embed-text

# 5. Start ChromaDB
docker run -p 8000:8000 chromadb/chroma
# OR: uv run chroma run --path ./data/chroma

# 6. Start all services concurrently (recommended)
bun run dev:all
# This starts: backend (3001), frontend (5173), and ChromaDB

# OR start individual services:
# bun run server    # Backend only  
# bun run dev       # Frontend only
# bun run chroma    # ChromaDB only

# 7. Import your Tana data (coming soon)
# bun run import:replace --file ~/Downloads/your-tana-export.json

# 8. Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3001
# Backend Health: http://localhost:3001/health
```

## Architecture

### Technology Stack

**Runtime & Backend:**
- **Bun**: Ultra-fast JavaScript runtime with native TypeScript support
- **Hono**: Lightweight web framework optimized for Bun
- **tRPC**: End-to-end typesafe APIs without code generation
- **SQLite**: Native Bun SQLite integration for graph relationships

**Frontend:**
- **Vite + React + TypeScript**: Modern frontend development
- **TanStack Router**: File-based routing with full type safety
- **TanStack Query**: Intelligent server state management
- **TanStack Table**: Powerful data grids for browsing nodes
- **shadcn/ui + Tailwind**: Modern UI components and styling

**AI & Vector Database:**
- **Ollama**: Local LLM hosting (Llama 3.2 3B)
- **ChromaDB**: Vector database for semantic search
- **nomic-embed-text**: Text embeddings via Ollama

**Python Services:**
- **uv**: Fast Python package manager
- **FastAPI**: High-performance Python API for ChromaDB integration

### Data Model

```typescript
interface TanaNode {
  id: string
  title: string
  content: string
  type: 'node' | 'field' | 'reference'
  tags: string[]
  supertags?: SuperTag[]
  parentId?: string
  children: string[]
  references: string[]
  fields: Record<string, any>
  created: Date
  modified: Date
  embedded: boolean
}

interface QueryResult {
  node: TanaNode
  score: number
  highlights: string[]
  path: string[] // breadcrumb trail
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: QueryResult[]
  timestamp: Date
}
```

## Project Structure

```
tana-local-kb/
├── server/                 # Bun backend
│   ├── src/
│   │   ├── index.ts       # Hono + tRPC server
│   │   ├── db/           # Database layer (SQLite + ChromaDB)
│   │   ├── services/     # Business logic (Ollama, embeddings)
│   │   └── routers/      # tRPC API routes
│   └── tsconfig.json
├── client/                # React frontend
│   ├── src/
│   │   ├── routes/       # TanStack Router pages
│   │   ├── components/   # React components
│   │   │   ├── ui/       # shadcn/ui components
│   │   │   ├── chat/     # Chat interface
│   │   │   ├── search/   # Search components
│   │   │   └── graph/    # Node visualization
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities and config
│   └── index.html
├── scripts/              # Utility scripts
│   ├── import.ts         # Tana JSON import (Bun)
│   └── chroma_service.py # ChromaDB service (Python)
├── data/                 # Local data storage
│   ├── imports/
│   │   ├── inbox/       # Drop new Tana exports here
│   │   ├── archive/     # Previous exports (auto-dated)
│   │   └── current.json # Symlink to active export
│   ├── tana.db          # SQLite database (rebuilt on import)
│   └── chroma/          # Vector embeddings (rebuilt on import)
├── package.json         # Node.js dependencies
├── pyproject.toml       # Python dependencies (uv)
├── bunfig.toml          # Bun configuration
└── README.md
```

## Development Workflow

### Daily Development Commands

```bash
# Start all services in development
bun run dev:all          # Starts backend, frontend, and ChromaDB

# Individual services
bun run server           # Backend only
bun run dev             # Frontend only
bun run chroma          # ChromaDB service only

# Data operations
bun run import:auto     # Watch inbox/ for new exports (recommended)
bun run import:replace  # Manual import, replaces all data
bun run import:backup   # Create backup before importing
bun run import:restore  # Restore from previous backup

# Testing and quality
bun run test            # Run test suite
bun run type-check      # TypeScript validation
bun run lint            # ESLint + Prettier
```

### My Workflow (Single User)

**Daily Usage:**
1. Export your Tana workspace as JSON when you want to update
2. Drop the export file into `data/imports/inbox/`
3. System auto-imports and archives the previous version
4. Continue chatting with your updated knowledge base

**Typical Cycle:**
- Work in Tana for days/weeks
- Export when you want fresh AI insights
- Simple drag-and-drop import (no complex merges)
- Previous data is safely archived with timestamps

### Data Directory Structure

The simplified data organization makes import management transparent:

```
data/
├── imports/
│   ├── inbox/              # 📥 DROP ZONE: Place new Tana exports here
│   │   └── (waiting for your next export)
│   ├── archive/            # 📚 AUTO-ARCHIVED: Previous exports with timestamps  
│   │   ├── 2024-09-15T10-30-00_tana-export.json
│   │   ├── 2024-09-10T14-22-15_tana-export.json
│   │   └── 2024-09-08T09-45-30_tana-export.json
│   └── current.json        # 🔗 SYMLINK: Points to your active export
├── tana.db                 # 🗄️  SQLite: Rebuilt from current.json on import
└── chroma/                 # 🧠 Vectors: Rebuilt from current.json on import
    ├── index/
    ├── chroma.sqlite3
    └── embeddings/
```

**How it works:**
1. **Drop and go**: Place `my-export.json` in `inbox/`
2. **Auto-processing**: System detects file, imports, and moves to archive with timestamp
3. **Safe replacement**: Previous `tana.db` and `chroma/` are rebuilt from new data
4. **History preserved**: Last 5 exports kept in archive (configurable)
5. **Easy rollback**: `bun run import:restore` lets you pick any archived export

**Benefits for single-user:**
- No merge conflicts or incremental complexity
- Clear audit trail of when you updated your knowledge base
- Safe experimentation (can always roll back)
- Zero-config backups

### Key Features

#### 1. Hybrid Search System
Combines multiple search strategies for optimal results:
- **Semantic search**: Vector similarity using embeddings
- **Keyword search**: Full-text search using SQLite FTS5
- **Graph traversal**: Relationship-based discovery

#### 2. Context-Aware Chat
- Automatically includes related nodes in LLM context
- Follows references for complete information
- Maintains conversation history
- Provides cited sources for all responses

#### 3. Simple Full-Replace Import
- Preserves all Tana relationships and structure
- Handles circular references gracefully
- Complete data replacement on each import
- Automatic backup of previous imports
- Maintains field types and values

#### 4. Interactive UI
- **Command Palette**: `Cmd+K` for instant search
- **Node Browser**: Click through graph relationships
- **Chat Interface**: Natural language queries with sources
- **Data Table**: Browse and filter nodes with TanStack Table

## API Reference

### tRPC Routes

```typescript
// Search API
searchRouter.hybrid({
  query: string,
  limit?: number,
  minScore?: number
}) → QueryResult[]

// Chat API  
chatRouter.message({
  message: string,
  history?: ChatMessage[]
}) → ChatMessage

// Node API
nodeRouter.get({ id: string }) → TanaNode
nodeRouter.children({ id: string }) → TanaNode[]
nodeRouter.references({ id: string }) → TanaNode[]

// Import API
importRouter.replace({
  filePath: string,
  backup?: boolean
}) → ImportResult

importRouter.auto() → ImportResult  // Watch inbox folder
```

### Configuration

```typescript
// config/app.ts
export const config = {
  llm: {
    model: 'llama3.2:3b',
    temperature: 0.7,
    maxTokens: 2000,
    baseUrl: 'http://localhost:11434'
  },
  embedding: {
    model: 'nomic-embed-text',
    chunkSize: 500,
    chunkOverlap: 50,
    batchSize: 100
  },
  search: {
    topK: 10,
    minScore: 0.7,
    rerank: true,
    hybridWeights: {
      semantic: 0.5,
      keyword: 0.3,
      graph: 0.2
    }
  },
  ui: {
    theme: 'dark',
    showGraph: false,
    keyboardShortcuts: true,
    pageSize: 50
  },
  // Single-user personal preferences
  import: {
    autoImportOnStartup: true,     // Check inbox/ on app startup
    watchInboxFolder: true,        // Monitor inbox/ for new files
    archiveRetentionDays: 30,      // Keep archives for 30 days
    maxArchiveFiles: 5,            // Keep last 5 imports
    notifyOnImportComplete: true   // Desktop notification when import finishes
  },
  personal: {
    defaultSearchMode: 'hybrid',   // 'semantic' | 'keyword' | 'hybrid'
    autoOpenChatOnStartup: false,  // Open chat interface immediately
    preferredLLMModel: 'llama3.2:3b',  // Can switch to different models easily
    chatContextSize: 8000,         // How much text to include in chat context
    saveSearchHistory: true,       // Remember your search queries
    quickActions: [                // Customize toolbar quick actions
      'search_semantic',
      'chat_new',
      'import_auto',
      'view_recent'
    ]
  }
}
```

### Why These Preferences Work for Single User

**Auto-Import Benefits:**
- No need to remember to manually import - just drop files in inbox/
- Startup check catches any exports you added while the app was closed
- Desktop notifications let you know when processing is complete

**Personal Customization:**
- Skip user authentication/management entirely
- Save your preferred search strategies and chat settings
- Customize the UI for YOUR workflow (no need to accommodate multiple users)
- Direct file system access (no upload size limits or cloud restrictions)

**Simplified Workflow:**
- Single config file (no complex multi-tenant settings)
- Personal keyboard shortcuts can be more aggressive/opinionated  
- Quick actions tuned to how YOU use the system most often
- Archive management that matches your actual usage patterns

## Performance Targets

- **Import speed**: 2,000+ nodes/second
- **Search latency**: <50ms for vector search
- **Chat response**: <1 second to first token
- **Memory usage**: <1GB for 50k nodes
- **UI responsiveness**: 60fps interactions
- **Server startup**: <500ms

## Development Phases

### Phase 1: Foundation (Week 1) - IN PROGRESS
- [x] Repository setup and basic structure
- [x] Package.json with all dependencies configured
- [x] Basic Hono server with health check endpoint  
- [x] Vite configuration with proxy setup
- [x] TypeScript configuration for client and server
- [x] Directory structure: client/, server/, scripts/, data/
- [x] Development scripts setup (dev:all, server, dev, chroma)
- [ ] **NEXT:** tRPC setup and basic API routes
- [ ] Tana JSON parser and import system
- [ ] SQLite schema and basic queries  
- [ ] ChromaDB integration with embeddings
- [ ] Simple search functionality
- [ ] Basic chat interface with Ollama
- [ ] Node viewer and navigation

### Phase 2: Core Features (Week 2)
- [ ] Hybrid search implementation
- [ ] Command palette (`Cmd+K`)
- [ ] TanStack Table for data browsing
- [ ] Improved chat with source citations
- [ ] Relationship graph visualization
- [ ] Keyboard shortcuts and navigation

### Phase 3: Polish (Week 3)
- [ ] Performance optimizations
- [ ] Better chunking strategies
- [ ] Batch operations UI
- [ ] Export functionality
- [ ] Settings and configuration UI
- [ ] Error handling and recovery

## Testing Strategy

```bash
# Unit tests (Bun built-in test runner)
bun test src/**/*.test.ts

# Integration tests
bun test tests/integration/

# E2E tests (Playwright)
bun test:e2e

# Performance tests
bun test:perf
```

## Debugging

### Common Issues

**ChromaDB Connection Failed**
```bash
# Check if ChromaDB is running
curl http://localhost:8000/api/v1/heartbeat

# Restart ChromaDB
docker restart chroma-container
```

**Ollama Model Loading**
```bash
# Check loaded models
ollama list

# Pull required models
ollama pull llama3.2:3b nomic-embed-text
```

**Import Failures**
```bash
# Check Tana JSON structure
bun run validate-json -- --file export.json

# Import with verbose logging
DEBUG=1 bun run import -- --file export.json
```

### Development Tools

```bash
# Database inspection
bun run db:inspect          # View SQLite schema
bun run db:query "SELECT *" # Run SQL queries

# Vector database
bun run chroma:inspect      # View collections
bun run chroma:query        # Test similarity search

# Performance monitoring
bun run profile             # CPU/memory profiling
bun run monitor            # Real-time metrics
```

## Deployment

### Local Production Build

```bash
# Build frontend
bun run build

# Start production server
bun run start
```

### Docker Deployment

```dockerfile
# Dockerfile example
FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Run the full test suite: `bun run test:all`
5. Submit a pull request with a clear description

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Automatic formatting
- **Conventional Commits**: Semantic commit messages
- **Test Coverage**: Aim for >80% coverage

## Resources

### Documentation
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [tRPC Documentation](https://trpc.io/)
- [TanStack Query](https://tanstack.com/query)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Ollama Documentation](https://ollama.ai/docs)

### Related Projects
- [Tana](https://tana.inc/) - Original note-taking system
- [Obsidian](https://obsidian.md/) - Similar local knowledge management
- [Logseq](https://logseq.com/) - Open-source block-based notes

## License

MIT License - See LICENSE file for details

---

**Last Updated:** September 15, 2024  
**Author:** Lisa Ross  
**Contact:** https://github.com/lisaross