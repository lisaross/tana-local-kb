/**
 * Memory validation tests for the streaming JSON parser
 * Validates memory usage stays under constraints and tests for memory leaks
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { StreamParser, parseFile } from '../../server/src/parser'
import { getMemoryUsage, getMemoryStats, forceGarbageCollection } from '../../server/src/parser/utils/memory'
import { generateStreamingTestFile, TEST_CONFIGS } from './test-data-generator'
import { MemoryLimitError } from '../../server/src/parser/types'

const TEST_DATA_DIR = join(process.cwd(), 'tests/data/memory')
const MEMORY_TEST_FILES = {
  MEDIUM_MEMORY: join(TEST_DATA_DIR, 'memory-test-medium.json'),
  LARGE_MEMORY: join(TEST_DATA_DIR, 'memory-test-large.json'),
  STREAMING_LARGE: join(TEST_DATA_DIR, 'memory-test-streaming.json')
}

// Memory test configurations
const MEMORY_CONFIGS = {
  MEDIUM_MEMORY: {
    ...TEST_CONFIGS.MEDIUM,
    nodeCount: 50000, // 50K nodes for reasonable test time
    contentLength: 800
  },
  LARGE_MEMORY: {
    ...TEST_CONFIGS.LARGE,
    nodeCount: 200000, // 200K nodes
    contentLength: 1200
  },
  STREAMING_LARGE: {
    ...TEST_CONFIGS.HUGE,
    nodeCount: 500000, // 500K nodes for memory stress test
    contentLength: 1000
  }
}

describe('Memory Validation Tests', () => {
  beforeAll(async () => {
    console.log('Setting up memory validation tests...')
    mkdirSync(TEST_DATA_DIR, { recursive: true })
    
    // Generate test files for memory validation
    console.log('Generating memory test files (this may take a moment)...')
    
    generateStreamingTestFile(
      MEMORY_CONFIGS.MEDIUM_MEMORY, 
      MEMORY_TEST_FILES.MEDIUM_MEMORY,
      (current, total) => {
        if (current % 10000 === 0) {
          console.log(`  Generated ${current}/${total} nodes for medium memory test`)
        }
      }
    )
    
    generateStreamingTestFile(
      MEMORY_CONFIGS.LARGE_MEMORY, 
      MEMORY_TEST_FILES.LARGE_MEMORY,
      (current, total) => {
        if (current % 25000 === 0) {
          console.log(`  Generated ${current}/${total} nodes for large memory test`)
        }
      }
    )
    
    console.log('Memory test files generated successfully')
  }, 120000) // 2 minute timeout for file generation
  
  afterAll(() => {
    // Clean up test files
    Object.values(MEMORY_TEST_FILES).forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    })
  })

  describe('Memory Constraint Validation', () => {
    it('should respect 100MB memory limit with medium dataset', async () => {
      const memoryLimit = 100 // 100MB as per requirements
      const memorySnapshots: number[] = []
      let peakMemoryUsage = 0
      
      const initialMemory = getMemoryUsage()
      
      const result = await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
        memoryLimit,
        batchSize: 500,
        progressInterval: 1000,
        progressCallback: (progress) => {
          const currentMemory = getMemoryUsage()
          peakMemoryUsage = Math.max(peakMemoryUsage, currentMemory)
          memorySnapshots.push(currentMemory)
        }
      })
      
      const finalMemory = getMemoryUsage()
      
      // Core requirement: Memory usage should not exceed 100MB
      expect(peakMemoryUsage).toBeLessThan(memoryLimit)
      expect(result.statistics.memoryPeak).toBeLessThan(memoryLimit)
      
      // Memory should return to reasonable levels after processing
      const memoryIncrease = finalMemory - initialMemory
      expect(memoryIncrease).toBeLessThan(50) // Should not retain more than 50MB
      
      // Verify substantial amount of data was processed
      expect(result.statistics.processedNodes).toBeGreaterThan(30000)
      
      console.log(`Memory validation - Medium dataset:`)
      console.log(`  Initial: ${initialMemory}MB, Peak: ${peakMemoryUsage}MB, Final: ${finalMemory}MB`)
      console.log(`  Processed: ${result.statistics.processedNodes} nodes`)
      console.log(`  Memory increase: ${memoryIncrease}MB`)
    }, 60000) // 1 minute timeout
    
    it('should handle large dataset under memory constraint', async () => {
      const memoryLimit = 100 // 100MB limit
      const memorySnapshots: number[] = []
      let maxMemoryObserved = 0
      
      const initialMemory = getMemoryUsage()
      
      const result = await parseFile(MEMORY_TEST_FILES.LARGE_MEMORY, {
        memoryLimit,
        batchSize: 300, // Smaller batches for memory efficiency
        progressInterval: 2000,
        skipSystemNodes: true,
        progressCallback: (progress) => {
          const currentMemory = getMemoryUsage()
          maxMemoryObserved = Math.max(maxMemoryObserved, currentMemory)
          memorySnapshots.push(currentMemory)
        }
      })
      
      const finalMemory = getMemoryUsage()
      
      // Core requirement verification
      expect(maxMemoryObserved).toBeLessThan(memoryLimit)
      expect(result.statistics.memoryPeak).toBeLessThan(memoryLimit)
      
      // Should process substantial dataset
      expect(result.statistics.processedNodes).toBeGreaterThan(100000)
      
      // Memory should stabilize
      if (memorySnapshots.length > 10) {
        const lastFive = memorySnapshots.slice(-5)
        const variance = Math.max(...lastFive) - Math.min(...lastFive)
        expect(variance).toBeLessThan(20) // Memory should be stable in final phase
      }
      
      console.log(`Memory validation - Large dataset:`)
      console.log(`  Peak memory: ${maxMemoryObserved}MB (limit: ${memoryLimit}MB)`)
      console.log(`  Processed: ${result.statistics.processedNodes} nodes`)
      console.log(`  Duration: ${result.statistics.duration}ms`)
    }, 120000) // 2 minute timeout
    
    it('should throw MemoryLimitError when constraint is violated', async () => {
      const veryLowLimit = 20 // 20MB - should be exceeded
      
      await expect(
        parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
          memoryLimit: veryLowLimit,
          continueOnError: false,
          batchSize: 1000 // Larger batches to trigger memory limit faster
        })
      ).rejects.toThrow(MemoryLimitError)
    }, 30000)
  })

  describe('Memory Leak Detection', () => {
    it('should not leak memory across multiple parse operations', async () => {
      const initialMemory = getMemoryUsage()
      const memoryReadings: number[] = [initialMemory]
      
      // Perform multiple parsing operations
      for (let i = 0; i < 5; i++) {
        await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
          memoryLimit: 80,
          batchSize: 1000,
          progressInterval: 5000
        })
        
        // Force garbage collection
        forceGarbageCollection()
        await new Promise(resolve => setTimeout(resolve, 100)) // Allow GC to complete
        
        const currentMemory = getMemoryUsage()
        memoryReadings.push(currentMemory)
        
        console.log(`Parse operation ${i + 1}: ${currentMemory}MB`)
      }
      
      const finalMemory = memoryReadings[memoryReadings.length - 1]
      const memoryGrowth = finalMemory - initialMemory
      
      // Memory growth should be minimal (< 30MB after 5 operations)
      expect(memoryGrowth).toBeLessThan(30)
      
      // Memory should not continuously increase
      const averageGrowthPerOperation = memoryGrowth / 5
      expect(averageGrowthPerOperation).toBeLessThan(10) // < 10MB per operation
    }, 300000) // 5 minute timeout
    
    it('should handle memory pressure with graceful degradation', async () => {
      const moderateLimit = 60 // 60MB limit
      let memoryWarnings = 0
      let continuedParsing = false
      
      const parser = new StreamParser({
        memoryLimit: moderateLimit,
        continueOnError: true,
        maxErrors: 100,
        batchSize: 200
      })
      
      parser.on('memory-warning', () => {
        memoryWarnings++
      })
      
      parser.on('node', () => {
        continuedParsing = true
      })
      
      try {
        const result = await parser.parseFile(MEMORY_TEST_FILES.LARGE_MEMORY)
        
        // Should have completed despite memory pressure
        expect(result.statistics.processedNodes).toBeGreaterThan(0)
        expect(continuedParsing).toBe(true)
        
        // May have received memory warnings
        console.log(`Memory warnings received: ${memoryWarnings}`)
        
      } catch (error) {
        // If memory limit error is thrown, it should be handled gracefully
        if (error instanceof MemoryLimitError) {
          console.log('Memory limit exceeded as expected in pressure test')
        } else {
          throw error
        }
      }
    }, 90000) // 1.5 minute timeout
  })

  describe('Garbage Collection Effectiveness', () => {
    it('should maintain stable memory during streaming with GC', async () => {
      const memorySnapshots: number[] = []
      let gcTriggeredCount = 0
      
      // Enable verbose GC logging for this test
      const originalGc = global.gc
      
      await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
        memoryLimit: 90,
        batchSize: 500,
        progressInterval: 1000,
        progressCallback: (progress) => {
          const currentMemory = getMemoryUsage()
          memorySnapshots.push(currentMemory)
          
          // Trigger GC periodically to test effectiveness
          if (memorySnapshots.length % 20 === 0) {
            forceGarbageCollection()
            gcTriggeredCount++
          }
        }
      })
      
      // Analyze memory stability
      if (memorySnapshots.length > 30) {
        // Split into three phases
        const firstThird = memorySnapshots.slice(0, Math.floor(memorySnapshots.length / 3))
        const middleThird = memorySnapshots.slice(
          Math.floor(memorySnapshots.length / 3), 
          Math.floor(2 * memorySnapshots.length / 3)
        )
        const lastThird = memorySnapshots.slice(Math.floor(2 * memorySnapshots.length / 3))
        
        const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length
        const avgMiddle = middleThird.reduce((a, b) => a + b, 0) / middleThird.length
        const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length
        
        // Memory should not consistently increase across phases
        expect(avgLast).toBeLessThan(avgFirst * 2) // Should not double
        
        console.log(`GC effectiveness test:`)
        console.log(`  Average memory - First: ${avgFirst.toFixed(1)}MB, Middle: ${avgMiddle.toFixed(1)}MB, Last: ${avgLast.toFixed(1)}MB`)
        console.log(`  GC triggered: ${gcTriggeredCount} times`)
      }
    }, 90000)
    
    it('should handle large individual nodes without memory explosion', async () => {
      // Create a file with very large individual nodes
      const largeNodeConfig = {
        nodeCount: 1000,
        systemNodeRatio: 0.1,
        maxChildren: 100,
        maxRefs: 50,
        contentLength: 10000, // Very large content per node
        malformedRatio: 0
      }
      
      const largeNodeFile = join(TEST_DATA_DIR, 'large-nodes-test.json')
      generateStreamingTestFile(largeNodeConfig, largeNodeFile)
      
      const memorySnapshots: number[] = []
      
      try {
        const result = await parseFile(largeNodeFile, {
          memoryLimit: 100,
          batchSize: 50, // Small batches for large nodes
          progressCallback: (progress) => {
            memorySnapshots.push(getMemoryUsage())
          }
        })
        
        // Should handle large nodes successfully
        expect(result.statistics.processedNodes).toBeGreaterThan(500)
        
        // Memory should remain controlled
        const maxMemory = Math.max(...memorySnapshots)
        expect(maxMemory).toBeLessThan(100)
        
      } finally {
        if (existsSync(largeNodeFile)) {
          unlinkSync(largeNodeFile)
        }
      }
    }, 60000)
  })

  describe('Memory Usage Under Different Configurations', () => {
    it('should use less memory with smaller batch sizes', async () => {
      const testConfigs = [
        { batchSize: 100, label: 'small' },
        { batchSize: 500, label: 'medium' },
        { batchSize: 2000, label: 'large' }
      ]
      
      const results: any[] = []
      
      for (const config of testConfigs) {
        let peakMemory = 0
        
        const result = await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
          batchSize: config.batchSize,
          memoryLimit: 100,
          progressCallback: (progress) => {
            if (progress.memoryUsage) {
              peakMemory = Math.max(peakMemory, progress.memoryUsage)
            }
          }
        })
        
        results.push({
          ...config,
          peakMemory: Math.max(peakMemory, result.statistics.memoryPeak),
          processedNodes: result.statistics.processedNodes,
          duration: result.statistics.duration
        })
      }
      
      // Smaller batch sizes should generally use less peak memory
      const smallBatch = results.find(r => r.label === 'small')
      const largeBatch = results.find(r => r.label === 'large')
      
      expect(smallBatch.peakMemory).toBeLessThanOrEqual(largeBatch.peakMemory * 1.2) // Allow 20% variance
      
      console.log('Batch size memory comparison:', results)
    }, 120000)
    
    it('should handle memory efficiently with different skip options', async () => {
      const configs = [
        { skipSystemNodes: true, preserveRawData: false, label: 'minimal' },
        { skipSystemNodes: false, preserveRawData: false, label: 'standard' },
        { skipSystemNodes: false, preserveRawData: true, label: 'full' }
      ]
      
      const results: any[] = []
      
      for (const config of configs) {
        let peakMemory = 0
        
        const result = await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
          ...config,
          memoryLimit: 100,
          batchSize: 500,
          progressCallback: (progress) => {
            if (progress.memoryUsage) {
              peakMemory = Math.max(peakMemory, progress.memoryUsage)
            }
          }
        })
        
        results.push({
          ...config,
          peakMemory: Math.max(peakMemory, result.statistics.memoryPeak),
          processedNodes: result.statistics.processedNodes,
          totalNodes: result.statistics.totalNodes
        })
      }
      
      // Minimal configuration should use least memory
      const minimal = results.find(r => r.label === 'minimal')
      const full = results.find(r => r.label === 'full')
      
      expect(minimal.peakMemory).toBeLessThanOrEqual(full.peakMemory)
      
      console.log('Configuration memory comparison:', results)
    }, 120000)
  })

  describe('Memory Statistics Accuracy', () => {
    it('should report accurate memory statistics', async () => {
      const memoryStats: any[] = []
      
      const result = await parseFile(MEMORY_TEST_FILES.MEDIUM_MEMORY, {
        memoryLimit: 100,
        batchSize: 500,
        progressInterval: 2000,
        progressCallback: (progress) => {
          const stats = getMemoryStats()
          memoryStats.push({
            reported: progress.memoryUsage || 0,
            actual: getMemoryUsage(),
            heapUsed: stats.heapUsed,
            heapTotal: stats.heapTotal,
            timestamp: Date.now()
          })
        }
      })
      
      // Verify reported memory matches actual measurements
      memoryStats.forEach(stat => {
        const difference = Math.abs(stat.reported - stat.actual)
        expect(difference).toBeLessThan(5) // Should be within 5MB
      })
      
      // Verify final statistics are reasonable
      expect(result.statistics.memoryPeak).toBeGreaterThan(0)
      expect(result.statistics.memoryPeak).toBeLessThan(100)
      
      // Heap statistics should be consistent
      const finalStats = getMemoryStats()
      expect(finalStats.heapUsed).toBeLessThan(finalStats.heapTotal)
      expect(finalStats.available).toBeGreaterThan(0)
      
      console.log('Final memory statistics:', finalStats)
    }, 60000)
  })
})