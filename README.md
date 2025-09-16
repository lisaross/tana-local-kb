# Tana Local Knowledge Base 🧠

Transform your Tana database into a powerful, locally-hosted AI knowledge system. Chat with your notes, find connections you never knew existed, and explore your thoughts with semantic search—all running entirely on your machine.

![Status: Parser Complete](https://img.shields.io/badge/Status-Parser%20Complete-green)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)
![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-orange)

## ✨ What is this?

If you love Tana's powerful note-taking but want to:
- **Ask questions** in natural language about your knowledge base
- **Find connections** between ideas using AI semantic search  
- **Keep everything local** - no cloud, no privacy concerns
- **Maintain relationships** - all your Tana structure preserved

Then this is for you!

## 🚀 Quick Demo

```bash
# 1. Clone and setup (takes ~5 minutes)
git clone https://github.com/lisaross/tana-local-kb.git
cd tana-local-kb
bun install

# 2. Test parser with your Tana export
bun run test-parser ~/Downloads/your-tana-export.json

# 3. Start everything
bun run dev:all

# 4. Open http://localhost:5173 (UI coming in Phase 2) 💬
```

## 🎯 Core Features

### ✅ **Streaming JSON Parser** (Phase 1 Complete!)
- **Memory Efficient**: Parse 1M+ Tana nodes using <100MB RAM
- **System Node Filtering**: Automatically removes Tana system/template nodes
- **Progress Tracking**: Real-time progress callbacks for large imports
- **Error Recovery**: Continues parsing even with malformed JSON
- **Performance**: 2,000+ nodes/second throughput
- **CLI Testing**: `bun run test-parser your-export.json`

### 🚧 **Coming in Phase 2**
- **💬 Chat Interface**: Ask questions about your knowledge base
- **🔍 Hybrid Search**: Semantic + keyword + graph relationship search
- **⚡ Command Palette**: `Cmd+K` for instant note discovery
- **🔗 Relationship Navigation**: Click through your knowledge graph

## 🛠 Tech Stack

We chose the fastest, most modern tools for optimal performance and privacy:

- **🔥 Bun**: 4x faster than Node.js - powers backend, builds, and native SQLite
- **⚛️ React + TypeScript**: Solid, type-safe frontend with TanStack Router/Query
- **🚀 Hono + tRPC**: Lightning-fast APIs with end-to-end type safety
- **🤖 Ollama**: Local AI models (Llama 3.2 3B for chat, nomic-embed-text for embeddings)
- **📊 ChromaDB**: Vector database for semantic similarity search
- **💎 SQLite**: Graph database for structured relationships and metadata

## 🏗️ Architecture Overview

### Hybrid Database Design

The system uses a **dual-database architecture** that combines the strengths of both structured and semantic search:

```
📄 Tana Export (JSON)
         ↓
🔄 Streaming Parser (Memory-efficient processing)
         ↓
    ┌─────────────────┬─────────────────┐
    ↓                 ↓                 ↓
💎 SQLite            📝 Content         🤖 Ollama
(Structure)          Extraction        (Embeddings)
                                          ↓
• Node metadata                      📊 ChromaDB
• Hierarchies                        (Vectors)
• References
• Full-text search
```

### Why Two Databases?

**SQLite (Structure & Metadata)**:
- Stores node relationships, hierarchies, and metadata
- Handles exact keyword searches with FTS5
- Manages graph traversal and relationship queries
- Maintains data integrity with foreign keys

**ChromaDB (Semantic Understanding)**:
- Stores vector embeddings of node content
- Enables similarity-based "conceptual" search
- Powers AI chat with relevant context retrieval
- Finds connections you might not have noticed

### Hybrid Search System

When you search, the system combines three approaches:

1. **🎯 Semantic Search** (ChromaDB): "Show me thoughts about productivity"
2. **🔍 Keyword Search** (SQLite): "Find nodes containing 'kanban'"  
3. **🕸️ Graph Traversal** (SQLite): "Explore connected ideas"

Results are merged and ranked for optimal relevance.

## 📋 Prerequisites

- **Bun** runtime ([install here](https://bun.sh))
- **Ollama** for AI ([install here](https://ollama.ai))
- **Docker** for ChromaDB (or Python with uv)
- Your Tana JSON export

## 🏃‍♂️ Getting Started

### 1. Install Dependencies

```bash
# Install Bun (if you haven't already)
curl -fsSL https://bun.sh/install | bash

# Clone the repo
git clone https://github.com/lisaross/tana-local-kb.git
cd tana-local-kb

# Install JavaScript dependencies
bun install

# Setup Python environment for ChromaDB
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install chromadb fastapi uvicorn
```

### 2. Start AI Services

```bash
# Start Ollama and download models
ollama pull llama3.2:3b        # Chat model for conversations
ollama pull nomic-embed-text    # Embedding model for semantic search

# Start ChromaDB (choose one)
docker run -p 8000:8000 chromadb/chroma          # Vector database (port 8000)
# OR: uv run chroma run --path ./data/chroma      # Python alternative
```

**What's running:**
- **Ollama** (port 11434): Local AI models for chat and embedding generation
- **ChromaDB** (port 8000): Vector database storing semantic embeddings

### 3. Test Parser with Your Data

Export your Tana workspace as JSON, then test the parser:

```bash
# Test parser with your Tana export
bun run test-parser ~/Downloads/your-tana-export.json

# Test with specific performance preset
bun run test-parser ~/Downloads/your-export.json MEMORY_EFFICIENT

# Run parser test suite
bun run test:parser:quick    # Quick tests (~30 seconds)
bun run test:parser         # Full test suite (~30 minutes)
```

Note: Full import system with database integration coming in Phase 2!

### 4. Start the Application

```bash
# Start everything at once
bun run dev:all

# Or start services individually:
# bun run server    # Hono backend API (port 3001)
# bun run dev       # React frontend (port 5173) 
# bun run chroma    # ChromaDB Python service (port 8000)
```

**Full service stack:**
- **Frontend** (port 5173): React UI with command palette and chat interface
- **Backend** (port 3001): Hono API server with tRPC endpoints and SQLite database
- **ChromaDB** (port 8000): Vector database for semantic search
- **Ollama** (port 11434): Local AI models for chat and embeddings

### 5. Explore the Parser! 🎉

The streaming parser is ready to test with your Tana exports! Visit `http://localhost:5173` to see the basic server health check. Full UI coming in Phase 2.

## 💡 Current Usage (Phase 2)

### Parser Features (Complete)
- **Test Parser**: `bun run test-parser your-export.json` to validate your Tana data
- **Performance Presets**: Try FAST, BALANCED, THOROUGH, or MEMORY_EFFICIENT modes
- **Test Suite**: Run `bun run test:parser:quick` to validate the parser
- **Memory Monitoring**: Parser tracks memory usage and provides detailed statistics

### Database Features (Complete)
- **Health Check**: `bun run db:inspect --health` to verify database status
- **Schema Inspection**: `bun run db:inspect --schema` to view all tables
- **Performance Testing**: `bun run benchmark --quick` to validate speed
- **Migrations**: `bun run migrate` to apply schema changes

### Coming in Phase 3:
- **tRPC APIs**: Connect parser and database to HTTP endpoints
- **Search Everything**: Use `Cmd+K` to quickly find any note
- **Ask Questions**: Try "What are my main projects?" or "Show me notes about AI"
- **Follow Links**: Click through relationships just like in Tana
- **Browse Tables**: Use the data table to filter and sort your notes

## 🔧 Development

For developers wanting to contribute or customize:

```bash
# Run tests
bun test                    # General tests
bun run test:parser         # Parser test suite (30 min)
bun run test:parser:quick   # Quick parser tests (30 sec)

# Type checking
bun run type-check

# Linting and formatting
bun run lint
bun run format

# Parser testing and validation
bun run test-parser /path/to/export.json        # Test parser on real data
bun run test-parser /path/to/export.json FAST   # With performance preset

# Database operations (Phase 2 complete)
bun run migrate                 # Apply schema migrations
bun run db:inspect --health     # Database health check  
bun run db:inspect --schema     # View detailed schema
bun run db:inspect --stats      # Table statistics
bun run benchmark --quick       # Performance validation
bun run test:database          # Database test suite
```

See [WARP.md](./WARP.md) for detailed technical documentation.

## 🎯 Roadmap

### ✅ Phase 1 Complete (Week 1)
- [x] Repository setup and project foundation
- [x] **Streaming JSON Parser** - Memory-efficient parser for large Tana exports
  - [x] Handles 1M+ nodes in <100MB RAM
  - [x] System node filtering (removes SYS_ nodes)
  - [x] Progress tracking and error recovery
  - [x] 93%+ test coverage with comprehensive test suite
  - [x] CLI tool (`bun run test-parser`)
  - [x] Multiple performance presets

### ✅ Phase 2 Complete (Week 2)
- [x] **Database Schema** - SQLite schema optimized for 1M+ graph relationships  
  - [x] 6 core tables with 45+ performance indexes
  - [x] Graph traversal algorithms (BFS, DFS, shortest paths)
  - [x] Transaction management with retry logic
  - [x] Migration system with version control
  - [x] CLI tools for inspection and benchmarking
  - [x] Comprehensive test suite with performance validation
- [x] **Dual-Database Architecture** - SQLite + ChromaDB coordination
- [x] **Performance Optimization** - <1ms inserts, <10ms relationship queries

### 🔄 Phase 3 (Week 3) - Next Up  
- [ ] **tRPC API Integration** - Connect database operations to HTTP endpoints
- [ ] **Parser-Database Bridge** - Import system streaming from parser to database
- [ ] **Basic React Frontend** - UI components with data fetching
- [ ] **ChromaDB Integration** - Vector embeddings for semantic search

### 🚀 Phase 4 (Week 4)
- [ ] Hybrid search (semantic + keyword + graph)
- [ ] Command palette (`Cmd+K`)
- [ ] Data table browser with TanStack Table
- [ ] Enhanced chat with source citations
- [ ] Graph visualization
- [ ] Performance optimizations
- [ ] Export functionality
- [ ] Settings UI

## 🤝 Contributing

We'd love your help! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b amazing-feature`
3. **Make** your changes and add tests
4. **Run** the test suite: `bun run test:all`
5. **Submit** a pull request

## 🐛 Troubleshooting

### ChromaDB won't start?
```bash
# Check if it's running
curl http://localhost:8000/api/v1/heartbeat

# Restart if needed
docker restart chroma-container
```

### Ollama models not loading?
```bash
# List available models
ollama list

# Pull required models
ollama pull llama3.2:3b nomic-embed-text
```

### Parser failing?
```bash
# Validate your Tana export first
bun run validate-json --file your-export.json

# Test parser with debug info
bun run test-parser your-export.json

# Run parser test suite to check for issues
bun run test:parser:quick
```

Need more help? Check out the [detailed troubleshooting guide](./WARP.md#debugging) in WARP.md.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- [Tana](https://tana.inc/) for creating an amazing note-taking system
- [Ollama](https://ollama.ai/) for making local AI accessible
- [Bun](https://bun.sh/) for blazing-fast JavaScript runtime

---

**Built with ❤️ by [Lisa Ross](https://github.com/lisaross)**

*Transform your knowledge. Chat with your thoughts. Keep it local.*