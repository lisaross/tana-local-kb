/**
 * Factory functions for creating parser instances with common configurations
 */

import { StreamParser } from './stream-parser'
import { createConsoleReporter } from './utils/progress'

/**
 * Create parser with sensible defaults for most use cases
 */
export function createParserWithDefaults(): StreamParser {
  return new StreamParser({
    skipSystemNodes: true,
    batchSize: 1000,
    memoryLimit: 100, // 100MB
    progressCallback: createConsoleReporter(),
    progressInterval: 1000,
    continueOnError: true,
    maxErrors: 100,
    preserveRawData: false,
    normalizeContent: true
  })
}

/**
 * Create parser optimized for large files and minimal memory usage
 */
export function createMemoryEfficientParser(): StreamParser {
  return new StreamParser({
    skipSystemNodes: true,
    batchSize: 500, // Smaller batches
    memoryLimit: 50, // Strict memory limit
    progressCallback: createConsoleReporter(),
    progressInterval: 2000,
    continueOnError: true,
    maxErrors: 50,
    preserveRawData: false, // Don't keep raw data
    normalizeContent: true
  })
}

/**
 * Create parser for development/debugging with verbose options
 */
export function createDebugParser(): StreamParser {
  return new StreamParser({
    skipSystemNodes: false, // Include system nodes for debugging
    batchSize: 100, // Small batches for easier debugging
    memoryLimit: 200,
    progressCallback: (progress) => {
      console.log(`[DEBUG] ${JSON.stringify(progress, null, 2)}`)
    },
    progressInterval: 100, // Frequent updates
    continueOnError: false, // Stop on first error for debugging
    maxErrors: 1,
    preserveRawData: true, // Keep raw data for inspection
    normalizeContent: false // Keep original content
  })
}

/**
 * Create parser with custom filtering for specific node types
 */
export function createFilteredParser(options: {
  includeTypes?: string[]
  excludeTypes?: string[]
  customFilter?: (node: any) => boolean
  memoryLimit?: number
}): StreamParser {
  const {
    includeTypes,
    excludeTypes,
    customFilter,
    memoryLimit = 100
  } = options
  
  const nodeFilter = (node: any) => {
    // Apply type inclusion filter
    if (includeTypes && includeTypes.length > 0) {
      if (!includeTypes.includes(node.type || node.docType || 'node')) {
        return false
      }
    }
    
    // Apply type exclusion filter
    if (excludeTypes && excludeTypes.length > 0) {
      if (excludeTypes.includes(node.type || node.docType || 'node')) {
        return false
      }
    }
    
    // Apply custom filter
    if (customFilter && !customFilter(node)) {
      return false
    }
    
    return true
  }
  
  return new StreamParser({
    skipSystemNodes: true,
    nodeFilter,
    batchSize: 1000,
    memoryLimit,
    progressCallback: createConsoleReporter(),
    progressInterval: 1000,
    continueOnError: true,
    maxErrors: 100,
    preserveRawData: false,
    normalizeContent: true
  })
}

/**
 * Create parser for production use with error handling and monitoring
 */
export function createProductionParser(options: {
  memoryLimit?: number
  maxErrors?: number
  progressCallback?: (progress: any) => void
  errorCallback?: (error: Error) => void
}): StreamParser {
  const {
    memoryLimit = 100,
    maxErrors = 1000,
    progressCallback,
    errorCallback
  } = options
  
  const parser = new StreamParser({
    skipSystemNodes: true,
    batchSize: 1000,
    memoryLimit,
    progressCallback: progressCallback || createConsoleReporter(),
    progressInterval: 5000, // Less frequent updates for production
    continueOnError: true,
    maxErrors,
    preserveRawData: false,
    normalizeContent: true
  })
  
  if (errorCallback) {
    parser.on('error', errorCallback)
  }
  
  // Add memory monitoring
  parser.on('memory-warning', (usage: number, limit: number) => {
    console.warn(`[Production Parser] Memory warning: ${usage}MB / ${limit}MB`)
  })
  
  return parser
}