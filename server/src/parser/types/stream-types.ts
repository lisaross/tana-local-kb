/**
 * Types specific to streaming JSON parsing
 */

import { Transform } from 'stream'
import { RawTanaNode, TanaNode } from './index'

// Stream parser state
export interface StreamParserState {
  totalNodes: number
  processedNodes: number
  skippedNodes: number
  errorCount: number
  startTime: number
  memoryUsage: number
  currentBatch: RawTanaNode[]
  isComplete: boolean
}

// Stream events
export interface StreamEvents {
  'node': (node: TanaNode) => void
  'batch': (nodes: TanaNode[]) => void
  'progress': (progress: any) => void
  'error': (error: Error) => void
  'complete': (result: any) => void
  'memory-warning': (usage: number, limit: number) => void
}

// Transform stream for processing nodes
export interface NodeTransformStream extends Transform {
  _transform(chunk: any, encoding: string, callback: Function): void
  _flush(callback: Function): void
}

// Streaming parser options (extends base parser options)
export interface StreamParserOptions {
  // Stream-specific options
  highWaterMark: number // Buffer size for streams
  objectMode: boolean
  
  // JSON parsing options
  jsonPath: string // JSONPath for nodes array (e.g., '$.nodes.*')
  streamingArray: boolean // Whether to stream array elements
  
  // Memory management
  autoGarbageCollect: boolean
  gcInterval: number // Trigger GC every N nodes
  
  // Backpressure handling
  backpressureThreshold: number
  pauseOnBackpressure: boolean
}

export const DEFAULT_STREAM_OPTIONS: StreamParserOptions = {
  highWaterMark: 16384,
  objectMode: true,
  jsonPath: '$.nodes.*',
  streamingArray: true,
  autoGarbageCollect: true,
  gcInterval: 1000,
  backpressureThreshold: 100,
  pauseOnBackpressure: true,
}