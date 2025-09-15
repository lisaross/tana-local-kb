/**
 * Performance tests for the streaming JSON parser
 * Tests throughput, benchmarks, and performance under various conditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { unlinkSync, existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { StreamParser, parseFile, parseFileWithProgress } from '../../server/src/parser'
import { getMemoryUsage, forceGarbageCollection } from '../../server/src/parser/utils/memory'
import { generateStreamingTestFile, TEST_CONFIGS } from './test-data-generator'
import { ParserOptions } from '../../server/src/parser/types'

const TEST_DATA_DIR = join(process.cwd(), 'tests/data/performance')
const PERFORMANCE_TEST_FILES = {
  SMALL_PERF: join(TEST_DATA_DIR, 'perf-small.json'),
  MEDIUM_PERF: join(TEST_DATA_DIR, 'perf-medium.json'),
  LARGE_PERF: join(TEST_DATA_DIR, 'perf-large.json'),
  HUGE_PERF: join(TEST_DATA_DIR, 'perf-huge.json')
}

// Performance test configurations targeting specific scenarios
const PERFORMANCE_CONFIGS = {
  SMALL_PERF: {
    ...TEST_CONFIGS.SMALL,
    nodeCount: 5000,
    contentLength: 300
  },
  MEDIUM_PERF: {
    ...TEST_CONFIGS.MEDIUM,
    nodeCount: 50000,
    contentLength: 800
  },
  LARGE_PERF: {
    ...TEST_CONFIGS.LARGE,
    nodeCount: 250000,
    contentLength: 1200
  },
  HUGE_PERF: {
    ...TEST_CONFIGS.HUGE,
    nodeCount: 1000000,
    contentLength: 1000
  }
}

interface PerformanceResult {
  nodeCount: number
  duration: number
  throughput: number // nodes per second
  memoryPeak: number
  memoryAverage: number
  fileSize: number
  errorRate: number
}

describe('Performance Tests', () => {
  beforeAll(async () => {
    console.log('Setting up performance tests...')
    mkdirSync(TEST_DATA_DIR, { recursive: true })
    
    // Generate performance test files
    console.log('Generating performance test files...')
    
    generateStreamingTestFile(PERFORMANCE_CONFIGS.SMALL_PERF, PERFORMANCE_TEST_FILES.SMALL_PERF)
    generateStreamingTestFile(PERFORMANCE_CONFIGS.MEDIUM_PERF, PERFORMANCE_TEST_FILES.MEDIUM_PERF)
    
    // Generate large file with progress reporting
    console.log('Generating large performance test file...')
    generateStreamingTestFile(
      PERFORMANCE_CONFIGS.LARGE_PERF, 
      PERFORMANCE_TEST_FILES.LARGE_PERF,
      (current, total) => {
        if (current % 50000 === 0) {
          console.log(`  Generated ${current}/${total} nodes for large perf test`)
        }
      }
    )
    
    console.log('Performance test files generated successfully')
  }, 180000) // 3 minute timeout for file generation
  
  afterAll(() => {
    // Clean up test files
    Object.values(PERFORMANCE_TEST_FILES).forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    })
  })

  describe('Throughput Benchmarks', () => {
    async function measurePerformance(
      filePath: string, 
      options: Partial<ParserOptions> = {},
      testName: string
    ): Promise<PerformanceResult> {
      const fileStats = statSync(filePath)
      const memoryReadings: number[] = []
      let nodeCount = 0
      
      const startTime = Date.now()
      const startMemory = getMemoryUsage()
      
      const result = await parseFile(filePath, {
        memoryLimit: 100,
        batchSize: 1000,
        progressInterval: 5000,
        ...options,
        progressCallback: (progress) => {
          const currentMemory = getMemoryUsage()
          memoryReadings.push(currentMemory)
          nodeCount = progress.processedNodes + progress.skippedNodes
          
          if (options.progressCallback) {
            options.progressCallback(progress)
          }
        }
      })
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      return {
        nodeCount: result.statistics.totalNodes,
        duration,
        throughput: result.statistics.processedNodes / (duration / 1000),
        memoryPeak: Math.max(...memoryReadings, result.statistics.memoryPeak),
        memoryAverage: memoryReadings.reduce((a, b) => a + b, 0) / memoryReadings.length,
        fileSize: Math.round(fileStats.size / 1024 / 1024), // MB
        errorRate: result.errors.length / result.statistics.totalNodes
      }
    }
    
    it('should achieve baseline throughput for small files', async () => {
      const result = await measurePerformance(
        PERFORMANCE_TEST_FILES.SMALL_PERF, 
        {},
        'Small File Baseline'
      )
      
      // Should process at least 1000 nodes per second for small files
      expect(result.throughput).toBeGreaterThan(1000)
      
      // Should complete quickly
      expect(result.duration).toBeLessThan(10000) // Under 10 seconds
      
      // Memory should be reasonable
      expect(result.memoryPeak).toBeLessThan(50)
      
      console.log('Small file performance:', result)
    }, 30000)
    
    it('should maintain good throughput for medium files', async () => {
      const result = await measurePerformance(
        PERFORMANCE_TEST_FILES.MEDIUM_PERF,
        { batchSize: 2000 },
        'Medium File Performance'
      )
      
      // Should maintain at least 500 nodes per second for medium files
      expect(result.throughput).toBeGreaterThan(500)
      
      // Should complete in reasonable time
      expect(result.duration).toBeLessThan(120000) // Under 2 minutes
      
      // Memory should stay under limit
      expect(result.memoryPeak).toBeLessThan(100)
      
      // Error rate should be minimal
      expect(result.errorRate).toBeLessThan(0.01) // Less than 1%
      
      console.log('Medium file performance:', result)
    }, 180000) // 3 minute timeout
    
    it('should handle large files efficiently', async () => {
      const result = await measurePerformance(
        PERFORMANCE_TEST_FILES.LARGE_PERF,
        { 
          batchSize: 1500,
          progressInterval: 25000,
          skipSystemNodes: true
        },
        'Large File Performance'
      )
      
      // Should maintain reasonable throughput even for large files
      expect(result.throughput).toBeGreaterThan(200) // At least 200 nodes per second
      
      // Should complete within reasonable time
      expect(result.duration).toBeLessThan(1200000) // Under 20 minutes
      
      // Memory constraint should be respected
      expect(result.memoryPeak).toBeLessThan(100)
      
      // Should process substantial amount of data
      expect(result.nodeCount).toBeGreaterThan(200000)
      
      console.log('Large file performance:', result)
    }, 1500000) // 25 minute timeout
  })

  describe('Performance Under Different Configurations', () => {
    it('should optimize performance with different batch sizes', async () => {
      const batchSizes = [500, 1000, 2000, 5000]
      const results: any[] = []
      
      for (const batchSize of batchSizes) {
        const result = await measurePerformance(
          PERFORMANCE_TEST_FILES.MEDIUM_PERF,
          { batchSize },
          `Batch Size ${batchSize}`
        )
        
        results.push({
          batchSize,
          ...result
        })
      }
      
      // Find optimal batch size (highest throughput)
      const optimal = results.reduce((best, current) => 
        current.throughput > best.throughput ? current : best
      )
      
      // Optimal batch size should be reasonable
      expect(optimal.batchSize).toBeGreaterThan(500)
      expect(optimal.batchSize).toBeLessThan(10000)
      
      console.log('Batch size optimization results:')
      results.forEach(r => {
        console.log(`  ${r.batchSize}: ${r.throughput.toFixed(1)} nodes/sec, ${r.memoryPeak}MB peak`)
      })
      console.log(`  Optimal: ${optimal.batchSize} (${optimal.throughput.toFixed(1)} nodes/sec)`)
    }, 300000) // 5 minute timeout
    
    it('should show performance impact of different options', async () => {
      const configurations = [
        { 
          name: 'minimal', 
          options: { 
            skipSystemNodes: true, 
            preserveRawData: false, 
            normalizeContent: false 
          } 
        },
        { 
          name: 'standard', 
          options: { 
            skipSystemNodes: true, 
            preserveRawData: false, 
            normalizeContent: true 
          } 
        },
        { 
          name: 'full', 
          options: { 
            skipSystemNodes: false, 
            preserveRawData: true, 
            normalizeContent: true 
          } 
        }
      ]
      
      const results: any[] = []
      
      for (const config of configurations) {
        const result = await measurePerformance(
          PERFORMANCE_TEST_FILES.SMALL_PERF,
          config.options,
          `Config ${config.name}`
        )
        
        results.push({
          name: config.name,
          ...result
        })
      }
      
      // Minimal config should be fastest
      const minimal = results.find(r => r.name === 'minimal')
      const full = results.find(r => r.name === 'full')
      
      expect(minimal.throughput).toBeGreaterThanOrEqual(full.throughput * 0.8) // Within 20%
      
      console.log('Configuration performance comparison:')
      results.forEach(r => {
        console.log(`  ${r.name}: ${r.throughput.toFixed(1)} nodes/sec, ${r.memoryPeak}MB peak`)
      })
    }, 120000)
  })

  describe('Performance Under Load', () => {
    it('should maintain performance across multiple parsing sessions', async () => {
      const sessions = 5
      const results: PerformanceResult[] = []
      
      for (let i = 0; i < sessions; i++) {
        console.log(`Performance session ${i + 1}/${sessions}`)
        
        const result = await measurePerformance(
          PERFORMANCE_TEST_FILES.SMALL_PERF,
          { batchSize: 1000 },
          `Session ${i + 1}`
        )
        
        results.push(result)
        
        // Force garbage collection between sessions
        forceGarbageCollection()
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Performance should remain consistent
      const throughputs = results.map(r => r.throughput)
      const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length
      const maxDeviation = Math.max(...throughputs) - Math.min(...throughputs)
      
      // Deviation should be less than 50% of average
      expect(maxDeviation).toBeLessThan(avgThroughput * 0.5)
      
      // Memory should not continuously increase
      const memoryGrowth = results[results.length - 1].memoryAverage - results[0].memoryAverage
      expect(memoryGrowth).toBeLessThan(20) // Less than 20MB growth
      
      console.log('Multi-session performance:')
      console.log(`  Average throughput: ${avgThroughput.toFixed(1)} nodes/sec`)
      console.log(`  Throughput range: ${Math.min(...throughputs).toFixed(1)} - ${Math.max(...throughputs).toFixed(1)}`)
      console.log(`  Memory growth: ${memoryGrowth.toFixed(1)}MB`)
    }, 180000)
    
    it('should handle concurrent parsing operations', async () => {
      // Test concurrent parsing (though typically not recommended)
      const concurrentPromises = [
        measurePerformance(PERFORMANCE_TEST_FILES.SMALL_PERF, { batchSize: 500 }, 'Concurrent 1'),
        measurePerformance(PERFORMANCE_TEST_FILES.SMALL_PERF, { batchSize: 500 }, 'Concurrent 2'),
        measurePerformance(PERFORMANCE_TEST_FILES.SMALL_PERF, { batchSize: 500 }, 'Concurrent 3')
      ]
      
      const startTime = Date.now()
      const results = await Promise.all(concurrentPromises)
      const totalTime = Date.now() - startTime
      
      // All should complete successfully
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.throughput).toBeGreaterThan(0)
        expect(result.nodeCount).toBeGreaterThan(0)
      })
      
      // Total time should be reasonable (not much worse than sequential)
      const estimatedSequentialTime = results.reduce((sum, r) => sum + r.duration, 0)
      expect(totalTime).toBeLessThan(estimatedSequentialTime * 1.5) // Allow 50% overhead
      
      console.log('Concurrent parsing results:')
      console.log(`  Total time: ${totalTime}ms`)
      console.log(`  Estimated sequential: ${estimatedSequentialTime}ms`)
      results.forEach((r, i) => {
        console.log(`  Parser ${i + 1}: ${r.throughput.toFixed(1)} nodes/sec`)
      })
    }, 120000)
  })

  describe('Error Recovery Performance', () => {
    it('should maintain performance despite errors', async () => {
      // Create a file with some malformed nodes
      const malformedConfig = {
        ...PERFORMANCE_CONFIGS.SMALL_PERF,
        malformedRatio: 0.05 // 5% malformed nodes
      }
      
      const malformedFile = join(TEST_DATA_DIR, 'perf-malformed.json')
      generateStreamingTestFile(malformedConfig, malformedFile)
      
      try {
        const result = await measurePerformance(
          malformedFile,
          { continueOnError: true, maxErrors: 1000 },
          'Error Recovery Performance'
        )
        
        // Should still maintain reasonable throughput
        expect(result.throughput).toBeGreaterThan(500)
        
        // Should have processed most nodes despite errors
        expect(result.nodeCount - (result.nodeCount * result.errorRate)).toBeGreaterThan(result.nodeCount * 0.9)
        
        console.log('Error recovery performance:', {
          ...result,
          successRate: (1 - result.errorRate) * 100
        })
        
      } finally {
        if (existsSync(malformedFile)) {
          unlinkSync(malformedFile)
        }
      }
    }, 60000)
    
    it('should fail fast when continueOnError is false', async () => {
      const malformedConfig = {
        ...PERFORMANCE_CONFIGS.SMALL_PERF,
        malformedRatio: 0.1
      }
      
      const malformedFile = join(TEST_DATA_DIR, 'perf-fail-fast.json')
      generateStreamingTestFile(malformedConfig, malformedFile)
      
      try {
        const startTime = Date.now()
        
        await expect(
          parseFile(malformedFile, {
            continueOnError: false,
            maxErrors: 5
          })
        ).rejects.toThrow()
        
        const duration = Date.now() - startTime
        
        // Should fail relatively quickly (not process entire file)
        expect(duration).toBeLessThan(30000) // Should fail within 30 seconds
        
        console.log(`Fail-fast completed in ${duration}ms`)
        
      } finally {
        if (existsSync(malformedFile)) {
          unlinkSync(malformedFile)
        }
      }
    }, 45000)
  })

  describe('Progress Reporting Performance', () => {
    it('should not significantly impact performance with progress callbacks', async () => {
      // Test without progress callback
      const withoutProgress = await measurePerformance(
        PERFORMANCE_TEST_FILES.MEDIUM_PERF,
        { progressCallback: undefined },
        'No Progress'
      )
      
      // Test with progress callback
      let progressCallbacks = 0
      const withProgress = await measurePerformance(
        PERFORMANCE_TEST_FILES.MEDIUM_PERF,
        { 
          progressInterval: 1000,
          progressCallback: () => { progressCallbacks++ }
        },
        'With Progress'
      )
      
      // Performance impact should be minimal (within 20%)
      const performanceImpact = (withoutProgress.throughput - withProgress.throughput) / withoutProgress.throughput
      expect(performanceImpact).toBeLessThan(0.2)
      
      // Should have received multiple progress callbacks
      expect(progressCallbacks).toBeGreaterThan(10)
      
      console.log('Progress callback impact:')
      console.log(`  Without: ${withoutProgress.throughput.toFixed(1)} nodes/sec`)
      console.log(`  With: ${withProgress.throughput.toFixed(1)} nodes/sec`)
      console.log(`  Impact: ${(performanceImpact * 100).toFixed(1)}%`)
      console.log(`  Callbacks: ${progressCallbacks}`)
    }, 240000) // 4 minute timeout
    
    it('should scale progress interval appropriately', async () => {
      const intervals = [100, 1000, 10000]
      const results: any[] = []
      
      for (const interval of intervals) {
        let callbacks = 0
        
        const result = await measurePerformance(
          PERFORMANCE_TEST_FILES.SMALL_PERF,
          { 
            progressInterval: interval,
            progressCallback: () => { callbacks++ }
          },
          `Interval ${interval}`
        )
        
        results.push({
          interval,
          callbacks,
          throughput: result.throughput,
          callbacksPerSecond: callbacks / (result.duration / 1000)
        })
      }
      
      // Smaller intervals should have more callbacks
      const sorted = results.sort((a, b) => a.interval - b.interval)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].callbacks).toBeLessThanOrEqual(sorted[i-1].callbacks)
      }
      
      console.log('Progress interval scaling:')
      results.forEach(r => {
        console.log(`  Interval ${r.interval}: ${r.callbacks} callbacks, ${r.callbacksPerSecond.toFixed(1)}/sec`)
      })
    }, 120000)
  })

  describe('Large Scale Performance', () => {
    it('should handle 1M+ nodes requirement simulation', async () => {
      // Since generating 1M nodes takes too long for regular tests,
      // we'll simulate by running smaller tests and extrapolating
      const testSizes = [1000, 5000, 25000]
      const results: any[] = []
      
      for (const size of testSizes) {
        const config = {
          ...PERFORMANCE_CONFIGS.SMALL_PERF,
          nodeCount: size
        }
        
        const testFile = join(TEST_DATA_DIR, `scale-test-${size}.json`)
        generateStreamingTestFile(config, testFile)
        
        try {
          const result = await measurePerformance(
            testFile,
            { batchSize: 1000, memoryLimit: 100 },
            `Scale ${size}`
          )
          
          results.push({
            nodeCount: size,
            duration: result.duration,
            throughput: result.throughput,
            memoryPeak: result.memoryPeak
          })
          
        } finally {
          if (existsSync(testFile)) {
            unlinkSync(testFile)
          }
        }
      }
      
      // Analyze scaling characteristics
      const throughputTrend = results.map(r => r.throughput)
      const memoryTrend = results.map(r => r.memoryPeak)
      
      // Throughput should not degrade significantly with size
      const throughputDecline = (throughputTrend[0] - throughputTrend[throughputTrend.length - 1]) / throughputTrend[0]
      expect(throughputDecline).toBeLessThan(0.5) // Less than 50% decline
      
      // Memory should scale reasonably
      const maxMemory = Math.max(...memoryTrend)
      expect(maxMemory).toBeLessThan(100) // Should stay under limit
      
      // Extrapolate to 1M nodes
      const avgThroughput = throughputTrend.reduce((a, b) => a + b, 0) / throughputTrend.length
      const estimated1MTime = 1000000 / avgThroughput / 60 // minutes
      
      console.log('Large scale simulation:')
      results.forEach(r => {
        console.log(`  ${r.nodeCount} nodes: ${r.throughput.toFixed(1)} nodes/sec, ${r.memoryPeak}MB`)
      })
      console.log(`  Estimated 1M nodes: ~${estimated1MTime.toFixed(1)} minutes`)
      
      // 1M nodes should be processable in reasonable time (under 2 hours)
      expect(estimated1MTime).toBeLessThan(120)
    }, 180000)
  })
})