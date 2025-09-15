/**
 * Core TypeScript types for Tana export parsing
 * This file defines the structure of Tana nodes and parser configuration
 */

// Raw Tana node as exported from Tana
export interface RawTanaNode {
  id: string
  name: string
  created: number // Unix timestamp
  docType?: string
  ownerId?: string
  children?: string[]
  refs?: string[]
  props?: Record<string, any>
  fieldProps?: Record<string, any>
  type?: 'node' | 'field' | 'reference'
  uid?: string
  dataType?: string
  sys?: boolean // System node indicator
}

// Processed Tana node with normalized structure
export interface TanaNode {
  id: string
  name: string
  content: string
  created: Date
  docType: string | null
  ownerId: string | null
  children: string[]
  references: string[]
  fields: Record<string, any>
  type: 'node' | 'field' | 'reference'
  isSystemNode: boolean
  raw: RawTanaNode // Keep original for debugging
}

// Progress tracking callback
export interface ParseProgress {
  totalNodes: number
  processedNodes: number
  skippedNodes: number
  currentNode?: string
  memoryUsage?: number
  elapsedTime?: number
  estimatedTimeRemaining?: number
}

export type ProgressCallback = (progress: ParseProgress) => void

// Parser configuration options
export interface ParserOptions {
  // Filtering options
  skipSystemNodes: boolean
  includeFields: string[]
  excludeFields: string[]
  
  // Performance options
  batchSize: number
  memoryLimit: number // in MB
  
  // Progress tracking
  progressCallback?: ProgressCallback
  progressInterval: number // Report progress every N nodes
  
  // Error handling
  continueOnError: boolean
  maxErrors: number
  
  // Output options
  preserveRawData: boolean
  normalizeContent: boolean
  
  // Node filtering
  nodeFilter?: (node: RawTanaNode) => boolean
}

// Default parser options
export const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  skipSystemNodes: true,
  includeFields: [],
  excludeFields: [],
  batchSize: 1000,
  memoryLimit: 100,
  progressInterval: 100,
  continueOnError: true,
  maxErrors: 1000,
  preserveRawData: false,
  normalizeContent: true,
}

// Parser error types
export class ParseError extends Error {
  constructor(
    message: string,
    public nodeId?: string,
    public lineNumber?: number,
    public cause?: Error
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

export class MemoryLimitError extends ParseError {
  constructor(currentUsage: number, limit: number) {
    super(`Memory limit exceeded: ${currentUsage}MB > ${limit}MB`)
    this.name = 'MemoryLimitError'
  }
}

// Parse result
export interface ParseResult {
  nodes: TanaNode[]
  statistics: {
    totalNodes: number
    processedNodes: number
    skippedNodes: number
    systemNodes: number
    errors: number
    duration: number
    memoryPeak: number
  }
  errors: ParseError[]
}

// Export all types
export * from './stream-types'