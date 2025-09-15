/**
 * Core streaming JSON parser for Tana export files
 * Handles large files efficiently with memory constraints
 */

import { createReadStream } from 'fs'
import { EventEmitter } from 'events'
import { 
  RawTanaNode, 
  TanaNode, 
  ParserOptions, 
  DEFAULT_PARSER_OPTIONS, 
  ParseResult, 
  ParseError,
  MemoryLimitError
} from './types'
import { isSystemNode } from './filters/system-node-filter'
import { 
  getMemoryUsage, 
  isMemoryLimitExceeded, 
  forceGarbageCollection,
  createMemoryAwareBatcher
} from './utils/memory'
import { ProgressTracker, createConsoleReporter } from './utils/progress'
import { batchProcessNodes } from './utils/node-processor'

/**
 * StreamParser class for parsing large Tana JSON export files
 */
export class StreamParser extends EventEmitter {
  private options: ParserOptions
  private progressTracker: ProgressTracker
  private statistics = {
    totalNodes: 0,
    processedNodes: 0,
    skippedNodes: 0,
    systemNodes: 0,
    errors: 0,
    duration: 0,
    memoryPeak: 0
  }
  private errors: ParseError[] = []
  private startTime: number = 0
  private isComplete: boolean = false
  
  constructor(options: Partial<ParserOptions> = {}) {
    super()
    this.options = { ...DEFAULT_PARSER_OPTIONS, ...options }
    this.progressTracker = new ProgressTracker(
      this.options.progressCallback || createConsoleReporter(),
      this.options.progressInterval
    )
  }
  
  /**
   * Parse a Tana JSON file using streaming approach
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    this.startTime = Date.now()
    this.isComplete = false
    
    try {
      // First pass: count total nodes for progress tracking
      const totalNodes = await this.countNodes(filePath)
      this.statistics.totalNodes = totalNodes
      this.progressTracker.setTotal(totalNodes)
      
      // Second pass: process nodes in streaming fashion
      const nodes = await this.streamProcessFile(filePath)
      
      // Finalize statistics
      this.statistics.duration = Date.now() - this.startTime
      this.statistics.memoryPeak = Math.max(this.statistics.memoryPeak, getMemoryUsage())
      this.progressTracker.complete()
      this.isComplete = true
      
      this.emit('complete', {
        nodes,
        statistics: this.statistics,
        errors: this.errors
      })
      
      return {
        nodes,
        statistics: this.statistics,
        errors: this.errors
      }
      
    } catch (error) {
      const parseError = error instanceof ParseError 
        ? error 
        : new ParseError(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      this.errors.push(parseError)
      this.emit('error', parseError)
      throw parseError
    }
  }
  
  /**
   * Count total nodes in the file for progress tracking
   */
  private async countNodes(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { encoding: 'utf8' })
      let buffer = ''
      let nodeCount = 0
      let inNodesArray = false
      let braceDepth = 0
      let inString = false
      let escapeNext = false
      
      stream.on('data', (chunk: string) => {
        buffer += chunk
        
        // Process buffer character by character to find nodes
        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i]
          
          if (escapeNext) {
            escapeNext = false
            continue
          }
          
          if (char === '\\') {
            escapeNext = true
            continue
          }
          
          if (char === '"') {
            inString = !inString
            continue
          }
          
          if (inString) continue
          
          if (char === '{') {
            braceDepth++
            // Check if we're starting a node in the nodes array
            if (inNodesArray && braceDepth === 1) {
              nodeCount++
            }
          } else if (char === '}') {
            braceDepth--
          } else if (char === '[' && buffer.substring(Math.max(0, i - 10), i).includes('"nodes"')) {
            inNodesArray = true
          } else if (char === ']' && inNodesArray && braceDepth === 0) {
            inNodesArray = false
          }
        }
        
        // Keep only the last part of buffer that might contain incomplete tokens
        if (buffer.length > 1000) {
          buffer = buffer.slice(-1000)
        }
      })
      
      stream.on('end', () => {
        resolve(nodeCount)
      })
      
      stream.on('error', reject)
    })
  }
  
  /**
   * Stream process the file and extract nodes
   */
  private async streamProcessFile(filePath: string): Promise<TanaNode[]> {
    return new Promise((resolve, reject) => {
      const allNodes: TanaNode[] = []
      const stream = createReadStream(filePath, { encoding: 'utf8' })
      let buffer = ''
      
      // Create memory-aware batcher
      const batcher = createMemoryAwareBatcher<TanaNode>(
        this.options.memoryLimit,
        async (batch: TanaNode[]) => {
          allNodes.push(...batch)
          this.emit('batch', batch)
        }
      )
      
      stream.on('data', async (chunk: string) => {
        buffer += chunk
        
        try {
          await this.processBuffer(buffer, batcher)
          
          // Keep reasonable buffer size
          if (buffer.length > 10000) {
            const lastCompleteNode = buffer.lastIndexOf('}')
            if (lastCompleteNode > 0) {
              buffer = buffer.slice(lastCompleteNode + 1)
            }
          }
          
          // Check memory limit
          const currentMemory = getMemoryUsage()
          this.statistics.memoryPeak = Math.max(this.statistics.memoryPeak, currentMemory)
          
          if (isMemoryLimitExceeded(this.options.memoryLimit)) {
            this.emit('memory-warning', currentMemory, this.options.memoryLimit)
            
            if (!this.options.continueOnError) {
              throw new MemoryLimitError(currentMemory, this.options.memoryLimit)
            }
          }
          
        } catch (error) {
          this.handleError(error instanceof Error ? error : new Error('Processing error'))
        }
      })
      
      stream.on('end', async () => {
        try {
          // Process any remaining buffer
          await this.processBuffer(buffer, batcher, true)
          await batcher.flush()
          
          resolve(allNodes)
        } catch (error) {
          reject(error)
        }
      })
      
      stream.on('error', reject)
    })
  }
  
  /**
   * Process buffer and extract complete JSON nodes
   */
  private async processBuffer(
    buffer: string, 
    batcher: any,
    _isEnd: boolean = false
  ): Promise<void> {
    let braceDepth = 0
    let nodeStart = -1
    let inString = false
    let escapeNext = false
    let inNodesArray = false
    
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i]
      
      if (escapeNext) {
        escapeNext = false
        continue
      }
      
      if (char === '\\') {
        escapeNext = true
        continue
      }
      
      if (char === '"') {
        inString = !inString
        continue
      }
      
      if (inString) continue
      
      // Check for nodes array start
      if (char === '[' && buffer.substring(Math.max(0, i - 10), i).includes('"nodes"')) {
        inNodesArray = true
        continue
      }
      
      if (!inNodesArray) continue
      
      if (char === '{') {
        if (braceDepth === 0) {
          nodeStart = i
        }
        braceDepth++
      } else if (char === '}') {
        braceDepth--
        
        if (braceDepth === 0 && nodeStart >= 0) {
          // We have a complete node
          const nodeJson = buffer.slice(nodeStart, i + 1)
          
          try {
            const rawNode: RawTanaNode = JSON.parse(nodeJson)
            await this.processNode(rawNode, batcher)
          } catch (error) {
            this.handleError(new ParseError(
              `Failed to parse node JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
              undefined,
              undefined,
              error instanceof Error ? error : undefined
            ))
          }
          
          nodeStart = -1
        }
      } else if (char === ']' && braceDepth === 0) {
        inNodesArray = false
      }
    }
  }
  
  /**
   * Process a single raw node
   */
  private async processNode(rawNode: RawTanaNode, batcher: any): Promise<void> {
    try {
      // Update memory peak
      this.statistics.memoryPeak = Math.max(this.statistics.memoryPeak, getMemoryUsage())
      
      // Check if this is a system node
      if (this.options.skipSystemNodes && isSystemNode(rawNode)) {
        this.statistics.skippedNodes++
        this.statistics.systemNodes++
        this.progressTracker.incrementSkipped(rawNode.id)
        return
      }
      
      // Apply custom node filter if provided
      if (this.options.nodeFilter && !this.options.nodeFilter(rawNode)) {
        this.statistics.skippedNodes++
        this.progressTracker.incrementSkipped(rawNode.id)
        return
      }
      
      // Process the node
      const { nodes, errors } = batchProcessNodes([rawNode], {
        preserveRawData: this.options.preserveRawData,
        normalizeContent: this.options.normalizeContent,
        validateNodes: true
      })
      
      if (errors.length > 0) {
        errors.forEach(error => {
          this.handleError(new ParseError(
            `Node processing error: ${error.errors.join(', ')}`,
            error.nodeId
          ))
        })
      }
      
      if (nodes.length > 0) {
        const processedNode = nodes[0]
        await batcher.add(processedNode)
        this.statistics.processedNodes++
        this.progressTracker.incrementProcessed(rawNode.id)
        this.emit('node', processedNode)
      }
      
      // Trigger garbage collection periodically
      if ((this.statistics.processedNodes + this.statistics.skippedNodes) % 1000 === 0) {
        forceGarbageCollection()
      }
      
    } catch (error) {
      this.handleError(new ParseError(
        `Failed to process node: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rawNode.id,
        undefined,
        error instanceof Error ? error : undefined
      ))
    }
  }
  
  /**
   * Handle parsing errors
   */
  private handleError(error: ParseError): void {
    this.errors.push(error)
    this.statistics.errors++
    
    this.emit('error', error)
    
    if (!this.options.continueOnError || this.errors.length >= this.options.maxErrors) {
      throw error
    }
  }
  
  /**
   * Get current parsing statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      isComplete: this.isComplete,
      progress: this.progressTracker.getProgress()
    }
  }
}

/**
 * Convenience function to parse a file with default options
 */
export async function parseFile(filePath: string, options?: Partial<ParserOptions>): Promise<ParseResult> {
  const parser = new StreamParser(options)
  return await parser.parseFile(filePath)
}

/**
 * Parse file with progress reporting to console
 */
export async function parseFileWithProgress(filePath: string, options?: Partial<ParserOptions>): Promise<ParseResult> {
  const parser = new StreamParser({
    ...options,
    progressCallback: createConsoleReporter()
  })
  
  parser.on('node', (_node: TanaNode) => {
    // Could add per-node logging here if needed
  })
  
  parser.on('error', (error: ParseError) => {
    console.error(`[Parser Error] ${error.message}`)
  })
  
  parser.on('memory-warning', (usage: number, limit: number) => {
    console.warn(`[Parser Warning] Memory usage ${usage}MB approaching limit ${limit}MB`)
  })
  
  return await parser.parseFile(filePath)
}