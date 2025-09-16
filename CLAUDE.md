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

## Code Review & Quality Assurance

### CodeRabbit Review Process

**IMPORTANT**: When working with CodeRabbit feedback, agents must follow the systematic triage process:

1. **Always use the `coderabbit-triage` agent** before marking any work complete
2. **Check `.claude/coderabbit-triage-checklist.md`** for the complete workflow
3. **Address ALL critical and important issues** - never ignore CodeRabbit comments
4. **Use environment-aware performance thresholds** to prevent CI flakiness

**Key Quality Gates:**
- 🔴 **Critical Issues**: Security, crashes, data corruption (fix immediately)
- 🟡 **Important Issues**: Error handling, performance, test stability (fix before merge)  
- 🔵 **Nice-to-Have**: Code organization, optimizations (fix if time permits)
- ⚪ **Nitpicks**: Style, formatting (address in batches)

CodeRabbit generates comprehensive feedback - the systematic triage process ensures nothing important gets missed.

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

**Phase 1 Foundation - COMPLETED** ✅
- ✅ Repository setup and basic project structure  
- ✅ Package.json with all required dependencies configured
- ✅ Basic Hono server with health check endpoint (port 3001)
- ✅ Vite configuration with proxy setup (port 5173)  
- ✅ TypeScript configuration for both client and server
- ✅ Directory structure: client/, server/, scripts/, data/
- ✅ Development scripts: dev:all, server, dev, chroma
- ✅ **COMPLETED: Streaming JSON Parser for Tana exports**
  - Memory-efficient parser handles 1M+ nodes in <100MB RAM
  - System node filtering (SYS_ prefixed nodes)
  - Progress tracking and error recovery
  - Comprehensive test suite (93%+ coverage)
  - Performance: 2,000+ nodes/second

**Phase 2 Database Schema - COMPLETED** ✅
- ✅ **COMPLETED: SQLite Database Schema for Graph Relationships**
  - Comprehensive schema for 1M+ nodes with bidirectional traversal
  - Dual-database architecture (SQLite + ChromaDB) for hybrid search
  - Performance-optimized indexes for <10ms relationship queries
  - Graph traversal algorithms (BFS, DFS, shortest paths)
  - Advanced search (semantic + keyword + graph)
  - Transaction management with retry logic and savepoints
  - Batch processing for 2000+ nodes/second imports
  - Migration system with version control and rollback
  - Comprehensive test suite with performance benchmarks
  - Complete documentation and CLI tools
- ⏳ **Next: tRPC API Integration and Parser-Database Bridge**

**File Structure Created:**
```
├── client/src/           # React frontend (Vite + TypeScript)
│   ├── components/       # React components
│   ├── hooks/           # Custom React hooks  
│   ├── lib/             # Utilities and config
│   └── routes/          # TanStack Router pages
├── server/src/          # Bun backend (Hono + tRPC)
│   ├── index.ts         # Basic Hono server with health endpoint
│   ├── parser/          # ✅ COMPLETED: Streaming JSON Parser
│   │   ├── README.md    # Complete parser documentation
│   │   ├── index.ts     # Main parser exports
│   │   ├── stream-parser.ts  # Core streaming parser (13k lines)
│   │   ├── config.ts    # Parser presets and configuration
│   │   ├── factory.ts   # Parser factory functions
│   │   ├── filters/     # System node filtering
│   │   ├── types/       # TypeScript definitions
│   │   └── utils/       # Memory management, progress tracking
│   └── database/        # 🚀 NEW: SQLite Database Schema
│       ├── README.md    # API reference and usage guide
│       ├── index.ts     # Main database exports
│       ├── config/      # Connection and environment configuration
│       ├── schema/      # Table definitions, indexes, migrations
│       ├── operations/  # CRUD, batch, and transaction operations
│       ├── queries/     # Graph traversal and search algorithms
│       ├── types/       # Database TypeScript definitions
│       ├── utils/       # Logging, performance, backup utilities
│       └── adapters/    # Parser and tRPC integration adapters
├── scripts/             # Utility scripts
│   ├── test-parser.ts   # CLI tool for testing parser
│   ├── migrate.ts       # 🚀 NEW: Database migration runner
│   ├── db-inspect.ts    # 🚀 NEW: Database inspection tool
│   └── benchmark.ts     # 🚀 NEW: Performance benchmarking
├── tests/               # Comprehensive test suites
│   ├── parser/          # ✅ Parser test suite (93%+ coverage)
│   └── database/        # 🚀 NEW: Database test suite (8 test files)
├── data/                # Local data storage
│   ├── imports/         # Tana export management
│   ├── samples/         # Sample Tana data for testing
│   └── {chroma}/        # ChromaDB storage
├── DATABASE_SCHEMA_GUIDE.md  # 🚀 NEW: Complete schema documentation
└── package.json         # All dependencies + 15+ new database scripts
```

## Parser Usage

The streaming parser is complete and ready to use:

```bash
# Test parser with a Tana export file
bun run test-parser /path/to/tana-export.json

# Test with specific performance preset
bun run test-parser /path/to/export.json MEMORY_EFFICIENT

# Run parser test suite
bun run test:parser:quick    # Quick tests (~30 seconds)
bun run test:parser         # Full test suite (~30 minutes)
```

**Parser Features:**
- **Memory Efficient**: Handles 257MB+ files using <100MB RAM
- **System Node Filtering**: Automatically filters Tana system nodes
- **Progress Tracking**: Real-time progress callbacks for UI
- **Error Recovery**: Continues parsing with malformed JSON
- **Performance**: 2,000+ nodes/second throughput
- **Test Coverage**: 93%+ function coverage, comprehensive test suite

## Database Usage

The database schema is complete and ready to use:

```bash
# Database management
bun run migrate                 # Apply schema migrations
bun run db:inspect --health     # Database health check
bun run benchmark --compare     # Validate performance

# Development workflow  
bun run test:database          # Run all database tests
bun run test:database:benchmarks # Performance validation
```

**Database Features:**
- **Graph-Optimized Schema**: 6 core tables with 45+ performance indexes
- **Dual-Database Architecture**: SQLite (structure) + ChromaDB (semantics)
- **High Performance**: <1ms node insertion, <10ms relationship queries
- **Advanced Search**: Hybrid semantic + keyword + graph traversal
- **Transaction Safety**: Atomic operations with retry logic and savepoints
- **Migration System**: Version-controlled schema changes with rollback
- **Test Coverage**: Comprehensive test suite with performance benchmarks

**Ready for Phase 3:** With both parser and database complete, next development should focus on:
1. **tRPC API Integration** - Connect database operations to HTTP endpoints
2. **Parser-Database Bridge** - Import system that streams from parser to database
3. **React Frontend APIs** - UI components and data fetching via tRPC
4. **ChromaDB Integration** - Connect vector database for semantic search

The project has a solid foundation with production-ready parser and database implementations.