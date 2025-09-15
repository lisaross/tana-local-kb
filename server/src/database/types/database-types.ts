/**
 * Extended database types and utilities for Tana knowledge base
 * 
 * This file provides additional type definitions, utility types,
 * and database operation interfaces.
 */

import type { 
  NodeRecord,
  NodeHierarchyRecord,
  NodeReferenceRecord,
  NodeSearchRecord,
  NodeStatsRecord,
  ImportRecord,
  NodeImportRecord,
  SchemaVersionRecord,
  NodeInsert,
  NodeUpdate,
  HierarchyInsert,
  ReferenceInsert,
  NodeWithRelations,
  NodeHierarchyPath,
  SearchResult,
  GraphMetrics
} from './schema.js'

// Database connection and transaction types
export interface DatabaseConnection {
  query: <T = any>(sql: string, params?: any[]) => T[]
  run: (sql: string, params?: any[]) => { changes: number; lastInsertRowid: number }
  transaction: <T>(fn: (tx: DatabaseTransaction) => T) => T
  close: () => void
}

export interface DatabaseTransaction {
  query: <T = any>(sql: string, params?: any[]) => T[]
  run: (sql: string, params?: any[]) => { changes: number; lastInsertRowid: number }
  rollback: () => void
}

// Batch operation types for performance
export interface BatchOperation<T> {
  operation: 'insert' | 'update' | 'delete'
  table: string
  data: T[]
  onConflict?: 'ignore' | 'replace' | 'abort'
}

export interface BatchResult {
  success: boolean
  processedCount: number
  errorCount: number
  errors: Array<{
    index: number
    error: string
    data?: any
  }>
  duration: number
}

// Node transformation types for import/export
export interface NodeTransformOptions {
  preserveIds: boolean
  generateNewIds: boolean
  validateReferences: boolean
  skipSystemNodes: boolean
  includeStats: boolean
}

export interface NodeExportFormat {
  nodes: NodeRecord[]
  hierarchy: NodeHierarchyRecord[]
  references: NodeReferenceRecord[]
  metadata: {
    exportedAt: string
    totalNodes: number
    version: string
    source: 'tana-local-kb'
  }
}

// Query building and pagination types
export interface QueryBuilder {
  select: (columns: string | string[]) => QueryBuilder
  from: (table: string) => QueryBuilder
  where: (condition: string, params?: any[]) => QueryBuilder
  join: (table: string, condition: string) => QueryBuilder
  leftJoin: (table: string, condition: string) => QueryBuilder
  orderBy: (column: string, direction?: 'ASC' | 'DESC') => QueryBuilder
  limit: (count: number) => QueryBuilder
  offset: (count: number) => QueryBuilder
  build: () => { sql: string; params: any[] }
}

export interface PaginationOptions {
  page: number
  pageSize: number
  sortBy?: string
  sortDirection?: 'ASC' | 'DESC'
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrevious: boolean
  }
}

// Search and filtering types
export interface SearchOptions {
  query: string
  nodeTypes?: string[]
  includeSystemNodes?: boolean
  maxResults?: number
  exactMatch?: boolean
  fuzzyThreshold?: number
}

export interface FilterOptions {
  nodeType?: string | string[]
  ownerIds?: string[]
  createdAfter?: Date
  createdBefore?: Date
  hasChildren?: boolean
  hasReferences?: boolean
  isSystemNode?: boolean
  minDepth?: number
  maxDepth?: number
}

// Graph analysis types
export interface PathFindingOptions {
  maxDepth?: number
  includeReferences?: boolean
  excludeNodeTypes?: string[]
  weightFunction?: (node: NodeRecord) => number
}

export interface NodePath {
  source: string
  target: string
  path: string[]
  distance: number
  pathType: 'hierarchy' | 'reference' | 'mixed'
}

export interface ClusterAnalysis {
  clusterId: string
  nodes: string[]
  centralNode: string
  cohesionScore: number
  avgPathLength: number
}

// Performance monitoring types
export interface QueryPerformance {
  query: string
  executionTime: number
  rowsReturned: number
  indexesUsed: string[]
  timestamp: Date
}

export interface DatabaseMetrics {
  totalSize: number // bytes
  tableStats: Record<string, {
    rowCount: number
    size: number
    lastVacuum?: Date
  }>
  indexStats: Record<string, {
    size: number
    usage: number
  }>
  performanceStats: {
    avgQueryTime: number
    slowQueries: QueryPerformance[]
    cacheHitRate: number
  }
}

// Validation and constraints
export interface ValidationRule {
  field: string
  rule: 'required' | 'maxLength' | 'pattern' | 'custom'
  value?: any
  message: string
  validator?: (value: any) => boolean
}

export interface SchemaValidation {
  tableName: string
  rules: ValidationRule[]
}

// Migration and versioning types
export interface MigrationDefinition {
  version: number
  description: string
  up: string[]    // SQL statements to apply
  down: string[]  // SQL statements to rollback
  checksum: string
}

export interface MigrationResult {
  version: number
  success: boolean
  error?: string
  duration: number
  appliedAt: Date
}

// Database adapter interface for different SQLite implementations
export interface DatabaseAdapter {
  connect: (path: string) => Promise<DatabaseConnection>
  backup: (source: string, destination: string) => Promise<void>
  vacuum: () => Promise<void>
  analyze: () => Promise<void>
  checkpoint: () => Promise<void>
  getMetrics: () => Promise<DatabaseMetrics>
}

// Configuration types
export interface DatabaseConfig {
  path: string
  memory: boolean
  readOnly: boolean
  timeout: number
  maxConnections: number
  pragmas: Record<string, string | number | boolean>
  enableWAL: boolean
  enableFTS: boolean
  backupInterval?: number
  autoVacuum: boolean
}

// Event types for database operations
export interface DatabaseEvent {
  type: 'insert' | 'update' | 'delete' | 'query'
  table: string
  affectedRows: number
  duration: number
  timestamp: Date
  metadata?: Record<string, any>
}

export type DatabaseEventHandler = (event: DatabaseEvent) => void

// Error types
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public query?: string,
    public params?: any[]
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class SchemaVersionError extends DatabaseError {
  constructor(expected: number, actual: number) {
    super(`Schema version mismatch: expected ${expected}, got ${actual}`)
    this.name = 'SchemaVersionError'
  }
}

export class ConstraintViolationError extends DatabaseError {
  constructor(constraint: string, value?: any) {
    super(`Constraint violation: ${constraint}${value ? ` (value: ${value})` : ''}`)
    this.name = 'ConstraintViolationError'
  }
}

// Type guards and utilities
export function isNodeRecord(obj: any): obj is NodeRecord {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.content === 'string' &&
    ['node', 'field', 'reference'].includes(obj.node_type)
}

export function isValidNodeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 100
}

// Re-export types from schema.ts for convenience
export type {
  NodeRecord,
  NodeHierarchyRecord,
  NodeReferenceRecord,
  NodeSearchRecord,
  NodeStatsRecord,
  ImportRecord,
  NodeImportRecord,
  SchemaVersionRecord,
  NodeInsert,
  NodeUpdate,
  HierarchyInsert,
  ReferenceInsert,
  NodeWithRelations,
  NodeHierarchyPath,
  SearchResult,
  GraphMetrics
}