/**
 * Tana JSON Parser - Main Export
 * 
 * A memory-efficient streaming parser for large Tana export files
 * Features:
 * - Handles files 100MB+ with low memory usage
 * - Filters system nodes during parsing
 * - Progress tracking with callbacks
 * - Error recovery and validation
 * - TypeScript support throughout
 */

// Main parser classes and functions
export { StreamParser, parseFile, parseFileWithProgress } from './stream-parser'

// Type definitions
export * from './types'

// Utility functions
export * from './utils'

// Filtering functions
export { isSystemNode, filterNodes, getNodeStatistics } from './filters/system-node-filter'

// Example usage and factory functions
export { createParserWithDefaults, createMemoryEfficientParser } from './factory'