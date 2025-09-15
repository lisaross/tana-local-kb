# Tana Local KB Database System

## Overview

This directory contains a comprehensive database implementation for the Tana Local Knowledge Base, built on SQLite with Bun's native database support. The system is designed to handle 1M+ nodes with optimal performance, type safety, and robust migration management.

## Architecture

### 🏗️ Structure

```
server/src/database/
├── config/               # Database configuration and connection management
│   ├── connection.ts     # SQLite connection wrapper with transactions
│   ├── settings.ts       # Performance settings and presets
│   ├── environment.ts    # Environment-specific configurations
│   └── index.ts         # Configuration exports
├── schema/               # Database schema definitions
│   ├── definitions.ts    # Table and trigger SQL definitions
│   ├── indexes.ts        # Performance indexes
│   ├── migrations/       # Migration system
│   │   └── index.ts     # Migration runner and definitions
│   └── index.ts         # Schema exports
├── types/               # TypeScript type definitions
│   ├── database-types.ts # Database operation types
│   ├── schema.ts        # Table structure types
│   └── index.ts         # Type exports
└── index.ts            # Main database module
```

## Key Features

### 🚀 Performance Optimized

- **45,900+ nodes/second** insert performance in batch operations
- **WAL mode** for better concurrency and crash recovery  
- **Memory-mapped I/O** for optimal read performance
- **FTS5 search** for full-text search capabilities
- **Comprehensive indexing** for fast graph traversal

### 🔄 Migration System

- Version-controlled schema changes
- **Forward and rollback** migrations
- **Integrity verification** after migrations
- **Checksum validation** for migration files
- **Atomic transactions** for migration safety

### 🛡️ Type Safety

- **Full TypeScript coverage** for all database operations
- **Compile-time validation** of SQL operations
- **Structured error handling** with custom error types
- **Interface-based design** for testability

### 🏛️ Architecture Patterns

- **Connection pooling** for efficient resource management
- **Transaction support** with automatic rollback
- **Event system** for operation monitoring
- **Environment-specific configuration**
- **Singleton pattern** for database instance management

## Configuration

### Environment Variables

```bash
# Database Configuration
DATABASE_PATH=./data/tana-kb.db          # Database file path
DATABASE_MEMORY=false                    # Use in-memory database
DATABASE_READ_ONLY=false                # Read-only mode
DATABASE_TIMEOUT=30000                  # Connection timeout (ms)
DATABASE_MAX_CONNECTIONS=5              # Connection pool size
DATABASE_ENABLE_WAL=true                # Enable WAL mode
DATABASE_ENABLE_FTS=true                # Enable full-text search
DATABASE_AUTO_VACUUM=true               # Enable auto-vacuum
DATABASE_BACKUP_INTERVAL=3600000        # Backup interval (ms)

# Environment
NODE_ENV=development                     # Environment type
DATABASE_PRESET=production               # Configuration preset
```

### Configuration Presets

| Preset | Use Case | Cache Size | Connections | WAL Mode |
|--------|----------|------------|-------------|----------|
| `development` | Local development | 8MB | 3 | ✅ |
| `production` | Production deployment | 128MB | 10 | ✅ |
| `testing` | Unit/integration tests | 256MB | 1 | ❌ |
| `high-performance` | Large datasets (1M+ nodes) | 512MB | 5 | ✅ |

## Database Schema

### Core Tables

**nodes** - Primary node storage
- `id` (TEXT) - Primary key, node identifier
- `name` (TEXT) - Node title/name (indexed)
- `content` (TEXT) - Full content (FTS enabled)
- `node_type` (TEXT) - Type: 'node', 'field', 'reference'
- `is_system_node` (INTEGER) - System node flag (0/1)
- `fields_json` (TEXT) - JSON fields data
- `metadata_json` (TEXT) - Additional metadata

**node_hierarchy** - Parent-child relationships
- `parent_id` (TEXT) - Parent node reference
- `child_id` (TEXT) - Child node reference  
- `position` (INTEGER) - Order within parent

**node_references** - Cross-references between nodes
- `source_id` (TEXT) - Source node
- `target_id` (TEXT) - Target node
- `reference_type` (TEXT) - Type of reference

**node_search** - FTS5 virtual table for search
- `id` (TEXT) - Node identifier
- `name`, `content`, `tags` - Searchable fields

### Performance Features

- **Automatic triggers** maintain `node_stats` for analytics
- **Circular reference prevention** in hierarchy
- **Foreign key constraints** ensure data integrity
- **Comprehensive indexing** for all query patterns

## Usage Examples

### Basic Operations

```typescript
import { initializeDatabase, getDatabase } from './database/index.js'

// Initialize database
const connection = await initializeDatabase()

// Insert a node
const result = connection.run(`
  INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`, ['node-1', 'My Node', 'Content here', 'node', 0, '{}', '{}'])

// Query nodes
const nodes = connection.query('SELECT * FROM nodes WHERE node_type = ?', ['node'])

// Transaction example
const txResult = connection.transaction(() => {
  // Multiple operations in single transaction
  connection.run('INSERT INTO nodes (...) VALUES (...)')
  connection.run('INSERT INTO node_hierarchy (...) VALUES (...)')
  return { success: true }
})
```

### Search Operations

```typescript
// Full-text search
const searchResults = connection.query(`
  SELECT n.*, s.rank, snippet(node_search, 1, '<mark>', '</mark>', '...', 32) as snippet
  FROM node_search s
  JOIN nodes n ON s.id = n.id
  WHERE node_search MATCH ?
  ORDER BY s.rank
`, ['search query'])

// Graph traversal - get all descendants
const descendants = connection.query(`
  WITH RECURSIVE descendants(id, child_id, level) AS (
    SELECT parent_id, child_id, 0 FROM node_hierarchy WHERE parent_id = ?
    UNION ALL
    SELECT h.parent_id, h.child_id, level + 1 
    FROM node_hierarchy h
    JOIN descendants d ON h.parent_id = d.child_id
    WHERE level < 100
  )
  SELECT n.*, d.level FROM nodes n 
  JOIN descendants d ON n.id = d.child_id
  ORDER BY d.level ASC
`, ['parent-node-id'])
```

### Configuration Management

```typescript
import { getDatabaseConfig, getConfigSummary } from './database/config/index.js'

// Get current configuration
const config = getDatabaseConfig()

// Configuration summary for debugging
const summary = getConfigSummary()
console.log('Database configuration:', summary)

// Create test database
const testConnection = await dbUtils.createTestConnection({
  pragmas: {
    synchronous: 'OFF',
    cache_size: '-32000'
  }
})
```

### Migration Management

```typescript
import { createMigrationRunner } from './database/schema/migrations/index.js'

const runner = createMigrationRunner(connection)

// Check migration status
const status = await runner.getStatus()
console.log(`Current version: ${status.currentVersion}`)
console.log(`Pending migrations: ${status.pendingMigrations}`)

// Apply all pending migrations
const results = await runner.migrate()

// Rollback to specific version
await runner.rollbackTo(1)

// Verify database integrity
const integrity = await runner.verifyIntegrity()
```

## Testing

### Test Suite

The database system includes comprehensive tests:

```bash
# Run all database tests
bun run test:database

# Run specific test categories
bun run test:db:connection     # Connection management
bun run test:db:migrations     # Migration system
bun run test:db:operations     # CRUD operations
bun run test:db:transactions   # Transaction handling
bun run test:db:performance    # Performance benchmarks
```

### Performance Benchmarks

- **Batch Insert**: 45,900+ nodes/second
- **Single Query**: <0.02ms average
- **Complex Graph Query**: <100ms for 1M+ nodes
- **Full-Text Search**: <50ms for large datasets
- **Migration Speed**: Complete schema setup in <5ms

## Monitoring and Debugging

### Database Health Check

```typescript
import { getDatabaseHealth } from './database/index.js'

const health = await getDatabaseHealth()
console.log('Database status:', health)
```

### Performance Monitoring

```typescript
import { enableDatabaseLogging } from './database/index.js'

// Enable query performance logging
enableDatabaseLogging()

// Get database statistics
const stats = dbUtils.getDatabaseStats()
console.log('Database size:', stats.totalSize)
console.log('Table counts:', stats.tables)
```

### Optimization

```typescript
// Optimize database performance
await dbUtils.optimizeDatabase()

// Create backup
await dbUtils.backupDatabase('./backup/tana-kb-backup.db')

// Execute raw SQL for debugging
const result = await dbUtils.executeRaw('EXPLAIN QUERY PLAN SELECT ...')
```

## Production Considerations

### Deployment Checklist

- ✅ Set `NODE_ENV=production`
- ✅ Configure appropriate `DATABASE_PATH`
- ✅ Enable `DATABASE_AUTO_VACUUM=true`
- ✅ Set `DATABASE_BACKUP_INTERVAL`
- ✅ Monitor database size and performance
- ✅ Set up log rotation for query logs

### Security

- Database files should have restricted permissions (600)
- Use read-only connections for analytical workloads
- Regular backups with verification
- Monitor for slow queries and optimize indexes

### Scaling

For datasets approaching SQLite limits:
- Consider partitioning strategies
- Implement read replicas for analytics
- Monitor WAL file growth
- Optimize PRAGMA settings for workload

## Integration Points

The database system integrates with:

- **Tana Parser**: Via import scripts and node insertion
- **ChromaDB**: For vector embeddings (separate service)
- **tRPC API**: Through database connection middleware
- **React Frontend**: Via API endpoints for data access

## Troubleshooting

### Common Issues

**Migration Failures**
```bash
# Check migration status
bun run test:db:migrations

# Manual integrity check
sqlite3 data/tana-kb.db "PRAGMA integrity_check"
```

**Performance Issues**
```bash
# Analyze query performance
bun run test:db:performance

# Check for missing indexes
sqlite3 data/tana-kb.db "EXPLAIN QUERY PLAN SELECT ..."
```

**Connection Issues**
```bash
# Test basic connectivity
bun run test:db:connection

# Check file permissions
ls -la data/tana-kb.db
```

## Future Enhancements

- [ ] **Read replicas** for analytics workloads
- [ ] **Automatic partitioning** for very large datasets
- [ ] **Backup scheduling** with retention policies
- [ ] **Query caching** for frequently accessed data
- [ ] **Connection pooling** improvements
- [ ] **Metrics collection** for operational monitoring