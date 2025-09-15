# Database Module API Reference

## Quick Start

```typescript
import { getDatabase } from './database/index.js'
import { createDatabaseOperations } from './database/operations/index.js'

// Initialize
const db = getDatabase()
const ops = createDatabaseOperations(db)

// Basic operations
const node = await ops.nodes.create(nodeData)
const children = await ops.edges.getChildren(nodeId)
const results = await ops.search.fullTextSearch(query)
```

## Core Modules

### Database Connection (`config/`)
- `connection.ts` - SQLite connection management
- `settings.ts` - Performance configurations
- `environment.ts` - Environment-specific settings

### Schema Management (`schema/`)
- `definitions.ts` - Table definitions and constraints
- `indexes.ts` - Performance indexes
- `migrations/` - Version-controlled schema changes

### Operations (`operations/`)
- `nodes.ts` - Node CRUD operations
- `edges.ts` - Hierarchy management
- `references.ts` - Cross-reference operations
- `batch.ts` - Bulk import/export
- `transactions.ts` - Transaction management

### Queries (`queries/`)
- `graph-traversal.ts` - BFS, DFS, pathfinding
- `search.ts` - Full-text and faceted search

## API Reference

### Node Operations

```typescript
// Create node
const node = await ops.nodes.create({
    id: 'node_123',
    name: 'My Note',
    content: 'Content here',
    docType: 'note',
    fields: { priority: 1 }
})

// Get node with relations
const nodeWithRelations = await ops.nodes.getWithRelations('node_123')

// Update node
await ops.nodes.update('node_123', { name: 'Updated Name' })

// Delete node (cascades to relationships)
await ops.nodes.delete('node_123')
```

### Hierarchy Operations

```typescript
// Get children (ordered)
const children = await ops.edges.getChildren('parent_id')

// Get parents
const parents = await ops.edges.getParents('child_id')

// Add child at specific position
await ops.edges.addChild('parent_id', 'child_id', 2)

// Move node to new parent
await ops.edges.moveNode('node_id', 'new_parent_id', 0)
```

### Reference Operations

```typescript
// Add reference
await ops.references.add('source_id', 'target_id', 'link')

// Get all references from a node
const outbound = await ops.references.getReferences('node_id')

// Get all references to a node
const inbound = await ops.references.getBackReferences('node_id')
```

### Batch Operations

```typescript
// Import Tana nodes efficiently
const result = await ops.batch.importTanaNodes(tanaNodes, progressCallback)

// Batch create with progress tracking
const result = await ops.batch.createNodes(nodes, { 
    batchSize: 1000,
    onProgress: (progress) => console.log(`${progress.percentage}% complete`)
})
```

### Graph Traversal

```typescript
// Breadth-first traversal
const subgraph = await ops.graph.breadthFirstTraversal('start_id', {
    maxDepth: 5,
    includeReferences: true
})

// Find shortest path
const path = await ops.graph.findShortestPath('start_id', 'end_id')

// Get connected components
const components = await ops.graph.getConnectedComponents()
```

### Search Operations

```typescript
// Full-text search
const results = await ops.search.fullTextSearch('knowledge management', {
    limit: 20,
    highlightMatches: true
})

// Faceted search
const faceted = await ops.search.facetedSearch({
    query: 'project',
    docType: ['note', 'project'],
    tags: ['important'],
    dateRange: { start: startDate, end: endDate }
})

// Hybrid search (text + graph + similarity)
const hybrid = await ops.search.hybridSearch('AI research', {
    contextNodeId: 'context_id',
    fusionMethod: 'weighted'
})
```

### Transaction Management

```typescript
// Simple transaction
await ops.transactions.execute(async (tx) => {
    await tx.nodes.create(node1)
    await tx.nodes.create(node2)
    await tx.edges.addChild(node1.id, node2.id, 0)
})

// With retry logic
await ops.transactions.executeWithRetry(async (tx) => {
    // Complex operations
}, { maxRetries: 3, backoffMs: 100 })
```

## Configuration

### Environment Variables

```bash
DATABASE_PATH=./data/tana-kb.db
DATABASE_PRESET=production
DATABASE_MAX_CONNECTIONS=10
DATABASE_ENABLE_WAL=true
DATABASE_AUTO_VACUUM=true
```

### Performance Presets

```typescript
import { DatabaseSettings } from './config/settings.js'

// Development: Fast startup, debugging
const devSettings = DatabaseSettings.development

// Production: Maximum performance
const prodSettings = DatabaseSettings.production

// High-performance: Optimized for 1M+ nodes
const hpSettings = DatabaseSettings.highPerformance
```

## CLI Tools

```bash
# Database management
bun run migrate                 # Apply migrations
bun run migrate --status        # Check migration status
bun run migrate --rollback      # Rollback last migration

# Database inspection
bun run db:inspect              # Overview
bun run db:inspect --schema     # Detailed schema
bun run db:inspect --stats      # Table statistics
bun run db:inspect --health     # Performance metrics

# Performance benchmarking
bun run benchmark               # Standard benchmarks
bun run benchmark --quick       # Quick validation
bun run benchmark --compare     # Compare with requirements
```

## Performance Targets

✅ **Met Requirements:**
- Node insertion: <1ms per node (batch mode)
- Relationship queries: <10ms for typical patterns
- Import speed: >1000 nodes/second from parser
- Memory usage: <50MB during 1M node import
- Graph traversal: <100ms for 1000-node subgraph

## Testing

```bash
# Run all database tests
bun run test:database

# Specific test categories
bun run test:database:unit          # Unit tests
bun run test:database:integration   # Integration tests
bun run test:database:performance   # Performance tests
bun run test:database:benchmarks    # Benchmark validation
```

## Error Handling

All operations return structured errors:

```typescript
try {
    await ops.nodes.create(invalidNode)
} catch (error) {
    if (error instanceof DatabaseError) {
        console.log(`Database error: ${error.message}`)
        console.log(`Code: ${error.code}`)
        console.log(`Context: ${error.context}`)
    }
}
```

## Migration Example

```typescript
// migrations/003_add_tags_table.sql
CREATE TABLE node_tags (
    node_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag)
);

CREATE INDEX idx_tags_node ON node_tags(node_id);
CREATE INDEX idx_tags_tag ON node_tags(tag);
```

## Best Practices

1. **Use transactions** for multi-step operations
2. **Batch operations** for bulk data manipulation
3. **Monitor performance** with built-in analytics
4. **Regular maintenance** with `ANALYZE` and `VACUUM`
5. **Test migrations** with sample data first
6. **Monitor memory** during large imports
7. **Use prepared statements** for repeated queries

## Integration Points

### Parser Integration
```typescript
import { TanaNode } from '../parser/types/index.js'
import { ParserAdapter } from './adapters/parser-adapter.js'

const adapter = new ParserAdapter(ops)
await adapter.importFromParser(parserStream)
```

### tRPC Integration
```typescript
import { TRPCAdapter } from './adapters/trpc-adapter.js'

const trpcAdapter = new TRPCAdapter(ops)
// Use in tRPC router definitions
```

## Troubleshooting

### Common Issues

1. **Connection errors**: Check file permissions and path
2. **Slow queries**: Use `EXPLAIN QUERY PLAN` to debug
3. **Memory issues**: Reduce batch sizes, increase GC frequency
4. **Lock contention**: Verify WAL mode is enabled
5. **Search issues**: Rebuild FTS index if needed

### Debug Commands

```typescript
// Query plan analysis
const plan = await ops.debug.explainQuery(sql, params)

// Performance metrics
const metrics = await ops.debug.getPerformanceMetrics()

// Memory usage
const memory = await ops.debug.getMemoryUsage()
```

---

For complete schema documentation, see [DATABASE_SCHEMA_GUIDE.md](../../DATABASE_SCHEMA_GUIDE.md).