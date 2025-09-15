# Tana Local Knowledge Base 🧠

Transform your Tana database into a powerful, locally-hosted AI knowledge system. Chat with your notes, find connections you never knew existed, and explore your thoughts with semantic search—all running entirely on your machine.

![Status: In Development](https://img.shields.io/badge/Status-In%20Development-yellow)
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

# 2. Import your Tana export
bun run import --file ~/Downloads/your-tana-export.json

# 3. Start everything
bun run dev:all

# 4. Open http://localhost:5173 and start chatting! 💬
```

## 🎯 Core Features

### 💬 Chat with Your Knowledge Base
Ask questions like "What were my key insights from last week?" and get answers with source citations.

### 🔍 Hybrid Search
- **Semantic**: Find conceptually similar content
- **Keyword**: Traditional text search
- **Graph**: Discover through relationships

### ⚡ Command Palette
Press `Cmd+K` for instant search across all your notes.

### 🔗 Relationship Navigation
Click through your knowledge graph just like in Tana.

## 🛠 Tech Stack

We chose the fastest, most modern tools:

- **🔥 Bun**: 4x faster than Node.js for everything
- **⚛️ React + TypeScript**: Solid, type-safe frontend
- **🚀 Hono + tRPC**: Lightning-fast APIs with end-to-end type safety
- **🤖 Ollama**: Local AI models (Llama 3.2 3B)
- **📊 ChromaDB**: Vector database for semantic search
- **💎 SQLite**: Bun's native database for relationships

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
ollama pull llama3.2:3b
ollama pull nomic-embed-text

# Start ChromaDB (choose one)
docker run -p 8000:8000 chromadb/chroma
# OR: uv run chroma run --path ./data/chroma
```

### 3. Import Your Data

Export your Tana workspace as JSON, then:

```bash
bun run import --file ~/Downloads/your-tana-export.json
```

### 4. Start the Application

```bash
# Start everything at once
bun run dev:all

# Or start services individually:
# bun run server    # Backend API
# bun run dev       # Frontend
# bun run chroma    # ChromaDB service
```

### 5. Open and Explore! 🎉

Visit `http://localhost:5173` and start exploring your knowledge base!

## 💡 Usage Tips

- **Search Everything**: Use `Cmd+K` to quickly find any note
- **Ask Questions**: Try "What are my main projects?" or "Show me notes about AI"
- **Follow Links**: Click through relationships just like in Tana
- **Browse Tables**: Use the data table to filter and sort your notes

## 🔧 Development

For developers wanting to contribute or customize:

```bash
# Run tests
bun test

# Type checking
bun run type-check

# Linting and formatting
bun run lint
bun run format

# Database operations
bun run db:inspect    # View database schema
bun run migrate       # Run migrations
```

See [WARP.md](./WARP.md) for detailed technical documentation.

## 🎯 Roadmap

### ✅ Phase 1 (Week 1)
- [x] Repository setup
- [ ] Tana JSON import
- [ ] Basic search functionality
- [ ] Simple chat interface

### 🔄 Phase 2 (Week 2)
- [ ] Hybrid search
- [ ] Command palette
- [ ] Data table browser
- [ ] Enhanced chat with citations

### 🚀 Phase 3 (Week 3)
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

### Import failing?
```bash
# Validate your Tana export first
bun run validate-json --file your-export.json

# Run with debug logs
DEBUG=1 bun run import --file your-export.json
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