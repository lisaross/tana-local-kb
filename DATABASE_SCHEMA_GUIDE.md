# Database Schema Guide

## Overview

This document provides comprehensive documentation for the Tana Local Knowledge Base SQLite database schema, designed to efficiently store and query 1M+ interconnected Tana nodes with complex graph relationships.

## Architecture

### Technology Stack
- **Database**: SQLite 3.45+
- **Runtime**: Bun's native SQLite integration
- **TypeScript**: Full type safety with schema validation
- **Performance**: Optimized for 1M+ nodes with <50MB memory usage

### Design Principles
1. **Graph-First**: Optimized for hierarchical and reference relationships
2. **Performance**: Sub-10ms queries for typical access patterns
3. **Scalability**: Efficient handling of 1M+ nodes with proper indexing
4. **Type Safety**: Comprehensive TypeScript integration
5. **Data Integrity**: Foreign key constraints and validation

## Schema Design

### Core Tables

#### 1. `nodes` - Primary Entity Storage
```sql
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,           -- Unique node identifier from Tana
    name TEXT NOT NULL,            -- Display name/title
    content TEXT,                  -- Rich text content (searchable)
    props JSON NOT NULL,           -- Flexible properties storage
    indexed_content TEXT,          -- FTS-optimized content
    created_at INTEGER,            -- Unix timestamp
    doc_type TEXT,                 -- Document type (note, project, task, etc.)
    owner_id TEXT,                 -- Ownership reference
    node_type TEXT DEFAULT 'node', -- 'node' | 'field' | 'reference'
    FOREIGN KEY (owner_id) REFERENCES nodes(id) ON DELETE SET NULL
);
```

**Purpose**: Store all Tana nodes with flexible JSON properties for extensibility.

**Key Features**:
- JSON properties support any Tana field structure
- Indexed content for full-text search
- Self-referential ownership model
- Type classification for different node kinds

#### 2. `node_hierarchy` - Parent-Child Relationships
```sql
CREATE TABLE node_hierarchy (
    parent_id TEXT NOT NULL,       -- Parent node ID
    child_id TEXT NOT NULL,        -- Child node ID  
    position INTEGER NOT NULL,     -- Order within parent (0-based)
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_id, child_id)
);
```

**Purpose**: Maintain ordered hierarchical relationships preserving Tana's children array structure.

**Key Features**:
- Position-based ordering within parent
- Cascade deletion for data integrity
- Circular reference prevention (via triggers)
- Efficient parent/child queries

#### 3. `node_references` - Cross-References
```sql
CREATE TABLE node_references (
    source_id TEXT NOT NULL,       -- Source node ID
    target_id TEXT NOT NULL,       -- Target node ID
    reference_type TEXT DEFAULT 'link', -- Type of reference
    created_at INTEGER DEFAULT (unixepoch()),
    metadata JSON DEFAULT '{}',    -- Additional reference data
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
);
```

**Purpose**: Store bidirectional references between nodes, supporting Tana's reference system.

**Key Features**:
- Typed references (link, mention, embed, etc.)
- Metadata for rich reference information
- Bidirectional lookup optimization
- Prevents self-references

#### 4. `node_search` - Full-Text Search (FTS5)
```sql
CREATE VIRTUAL TABLE node_search USING fts5(
    node_id UNINDEXED,            -- Reference to nodes table
    content,                      -- Searchable content
    name,                         -- Searchable name
    content=nodes,                -- Source table
    content_rowid=id             -- Row ID mapping
);
```

**Purpose**: Provide fast full-text search across node content and names.

**Key Features**:
- Porter stemming for better search results
- Unicode normalization
- Phrase and boolean search support
- Relevance ranking

### Supporting Tables

#### 5. `node_stats` - Analytics and Performance
```sql
CREATE TABLE node_stats (
    node_id TEXT PRIMARY KEY,
    view_count INTEGER DEFAULT 0,
    reference_count INTEGER DEFAULT 0,
    child_count INTEGER DEFAULT 0,
    depth_level INTEGER DEFAULT 0,
    last_accessed INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

**Purpose**: Track usage analytics and pre-computed statistics for optimization.

#### 6. `imports` - Data Lineage
```sql
CREATE TABLE imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id TEXT UNIQUE NOT NULL,
    filename TEXT,
    total_nodes INTEGER,
    processed_nodes INTEGER,
    start_time INTEGER,
    end_time INTEGER,
    status TEXT DEFAULT 'in_progress',
    metadata JSON DEFAULT '{}'
);
```

**Purpose**: Track import history and data provenance.

#### 7. `schema_versions` - Migration Management
```sql
CREATE TABLE schema_versions (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER DEFAULT (unixepoch()),
    checksum TEXT,
    migration_time INTEGER
);
```

**Purpose**: Track database schema versions and migration history.

## Indexing Strategy

### Performance Indexes

```sql
-- Node lookup optimization
CREATE INDEX idx_nodes_created ON nodes(created_at DESC);
CREATE INDEX idx_nodes_doctype ON nodes(doc_type);
CREATE INDEX idx_nodes_owner ON nodes(owner_id);
CREATE INDEX idx_nodes_type ON nodes(node_type);

-- Hierarchy traversal optimization  
CREATE INDEX idx_hierarchy_parent_pos ON node_hierarchy(parent_id, position);
CREATE INDEX idx_hierarchy_child ON node_hierarchy(child_id);
CREATE INDEX idx_hierarchy_created ON node_hierarchy(created_at DESC);

-- Reference lookup optimization
CREATE INDEX idx_references_target ON node_references(target_id);
CREATE INDEX idx_references_type ON node_references(reference_type);
CREATE INDEX idx_references_created ON node_references(created_at DESC);

-- Statistics optimization
CREATE INDEX idx_stats_views ON node_stats(view_count DESC);
CREATE INDEX idx_stats_refs ON node_stats(reference_count DESC);
CREATE INDEX idx_stats_accessed ON node_stats(last_accessed DESC);

-- Import tracking
CREATE INDEX idx_imports_status ON imports(status);
CREATE INDEX idx_imports_time ON imports(start_time DESC);
```

### Covering Indexes for Common Queries

```sql
-- Complete hierarchy information in one index
CREATE INDEX idx_hierarchy_complete ON node_hierarchy(parent_id, position, child_id);

-- Reference analysis covering index
CREATE INDEX idx_references_analysis ON node_references(source_id, target_id, reference_type);

-- Node overview covering index  
CREATE INDEX idx_nodes_overview ON nodes(id, name, doc_type, created_at);
```

## Data Integrity

### Foreign Key Constraints
- All relationships enforce referential integrity
- Cascade deletion for hierarchy (children deleted with parents)
- Set NULL for ownership (nodes survive owner deletion)

### Triggers for Data Consistency

```sql
-- Prevent circular hierarchy references
CREATE TRIGGER prevent_circular_hierarchy 
BEFORE INSERT ON node_hierarchy
WHEN EXISTS (
    WITH RECURSIVE ancestors(id) AS (
        SELECT NEW.parent_id
        UNION ALL
        SELECT h.parent_id 
        FROM node_hierarchy h, ancestors a
        WHERE h.child_id = a.id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.child_id
);

-- Auto-update statistics
CREATE TRIGGER update_node_stats_on_reference
AFTER INSERT ON node_references
BEGIN
    UPDATE node_stats 
    SET reference_count = reference_count + 1, updated_at = unixepoch()
    WHERE node_id = NEW.target_id;
END;
```

### Validation Rules
- Node IDs must be non-empty strings
- Position values must be non-negative
- Reference types must be from predefined set
- JSON properties must be valid JSON

## Query Patterns

### 1. Hierarchical Queries

```sql
-- Get all children of a node (ordered)
SELECT n.id, n.name, h.position
FROM node_hierarchy h
JOIN nodes n ON h.child_id = n.id  
WHERE h.parent_id = ?
ORDER BY h.position;

-- Get all ancestors of a node
WITH RECURSIVE ancestors(id, name, level) AS (
    SELECT n.id, n.name, 0
    FROM nodes n WHERE n.id = ?
    UNION ALL
    SELECT n.id, n.name, a.level + 1
    FROM nodes n
    JOIN node_hierarchy h ON n.id = h.parent_id
    JOIN ancestors a ON h.child_id = a.id
)
SELECT * FROM ancestors WHERE level > 0;

-- Get subtree (descendants) with depth limit
WITH RECURSIVE subtree(id, name, level) AS (
    SELECT n.id, n.name, 0
    FROM nodes n WHERE n.id = ?
    UNION ALL
    SELECT n.id, n.name, s.level + 1
    FROM nodes n
    JOIN node_hierarchy h ON n.id = h.child_id
    JOIN subtree s ON h.parent_id = s.id
    WHERE s.level < ?
)
SELECT * FROM subtree WHERE level > 0;
```

### 2. Reference Queries

```sql
-- Get all nodes referencing a target
SELECT n.id, n.name, r.reference_type
FROM node_references r
JOIN nodes n ON r.source_id = n.id
WHERE r.target_id = ?;

-- Get mutual references (bidirectional)
SELECT DISTINCT n.id, n.name
FROM nodes n
WHERE n.id IN (
    SELECT r1.target_id FROM node_references r1 
    WHERE r1.source_id = ?
    INTERSECT
    SELECT r2.source_id FROM node_references r2 
    WHERE r2.target_id = ?
);
```

### 3. Search Queries

```sql
-- Full-text search with ranking
SELECT n.id, n.name, n.content, 
       bm25(s.node_search) as rank
FROM node_search s
JOIN nodes n ON s.node_id = n.id
WHERE s.node_search MATCH ?
ORDER BY rank;

-- Combined text and graph search
SELECT DISTINCT n.id, n.name, s.rank
FROM (
    SELECT node_id, bm25(node_search) as rank
    FROM node_search 
    WHERE node_search MATCH ?
) s
JOIN nodes n ON s.node_id = n.id
LEFT JOIN node_hierarchy h ON n.id = h.child_id
LEFT JOIN nodes parent ON h.parent_id = parent.id
WHERE s.rank > -5.0
ORDER BY s.rank, n.created_at DESC;
```

### 4. Analytics Queries

```sql
-- Most referenced nodes
SELECT n.id, n.name, ns.reference_count
FROM nodes n
JOIN node_stats ns ON n.id = ns.node_id
ORDER BY ns.reference_count DESC
LIMIT 10;

-- Hierarchy depth analysis
SELECT depth_level, COUNT(*) as node_count
FROM node_stats
GROUP BY depth_level
ORDER BY depth_level;

-- Content type distribution  
SELECT doc_type, COUNT(*) as count
FROM nodes
GROUP BY doc_type
ORDER BY count DESC;
```

## Performance Optimization

### Configuration Settings

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;

-- Optimize cache size (32MB)
PRAGMA cache_size = -32768;

-- Enable memory-mapped I/O (256MB)
PRAGMA mmap_size = 268435456;

-- Foreign key enforcement
PRAGMA foreign_keys = ON;

-- Auto vacuum for maintenance
PRAGMA auto_vacuum = INCREMENTAL;
```

### Batch Operations

For optimal performance during imports:

1. **Use transactions** for atomicity
2. **Batch inserts** in groups of 1000-5000 nodes
3. **Disable automatic indexing** during large imports
4. **Use prepared statements** for repeated operations
5. **Monitor memory usage** and trigger GC as needed

### Query Optimization Tips

1. **Use covering indexes** for frequently accessed columns
2. **Limit result sets** with appropriate WHERE clauses
3. **Use EXPLAIN QUERY PLAN** to verify index usage
4. **Pre-compute statistics** for complex analytics
5. **Consider materialized views** for heavy queries

## Usage Examples

### TypeScript Integration

```typescript
import { getDatabase } from './database/index.js'
import { createDatabaseOperations } from './database/operations/index.js'

// Initialize database
const db = getDatabase()
const ops = createDatabaseOperations(db)

// Create a node
const node = await ops.nodes.create({
    id: 'node_123',
    name: 'My Note',
    content: 'This is the content',
    docType: 'note',
    fields: { priority: 1 }
})

// Get children with hierarchy
const children = await ops.edges.getChildren('node_123')

// Full-text search
const results = await ops.search.fullTextSearch('knowledge management')

// Graph traversal
const subgraph = await ops.graph.breadthFirstTraversal('node_123', { 
    maxDepth: 3 
})
```

### CLI Tools

```bash
# Run migrations
bun run migrate

# Inspect database
bun run db:inspect --health

# Performance benchmarks  
bun run benchmark --compare

# Database statistics
bun run db:inspect --stats
```

## Maintenance

### Regular Tasks

1. **Weekly**: Run `ANALYZE` to update query planner statistics
2. **Monthly**: `PRAGMA optimize` for automatic optimization
3. **Quarterly**: Full `VACUUM` to reclaim space
4. **As needed**: Rebuild FTS indexes if search performance degrades

### Monitoring

Track these metrics for optimal performance:

- Query execution times (target: <10ms for typical patterns)
- Memory usage during imports (target: <50MB)
- Database file size growth
- Index hit rates
- FTS search performance

### Troubleshooting

Common issues and solutions:

1. **Slow queries**: Check `EXPLAIN QUERY PLAN` and add missing indexes
2. **High memory usage**: Increase batch GC frequency during imports
3. **Search performance**: Rebuild FTS indexes with `INSERT INTO node_search(node_search) VALUES('rebuild')`
4. **Lock contention**: Verify WAL mode is enabled
5. **Integrity errors**: Run `PRAGMA integrity_check`

## Migration Guide

When schema changes are needed:

1. Create new migration file in `schema/migrations/`
2. Update version in `schema_versions` table
3. Test migration with sample data
4. Run migration via `bun run migrate`
5. Verify with `bun run db:inspect --health`

## Security Considerations

1. **File Permissions**: Ensure database file has appropriate access controls
2. **Input Validation**: All user input is validated before database operations
3. **SQL Injection**: Use parameterized queries exclusively
4. **Data Backup**: Regular backups with verification
5. **Connection Security**: Local-only access in production

---

This schema design provides a solid foundation for the Tana Local Knowledge Base, balancing performance, scalability, and maintainability while preserving the rich relationship structure of Tana data.