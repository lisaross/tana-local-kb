/**
 * Memory management utilities for the parser
 */

/**
 * Get current memory usage in MB
 */
export function getMemoryUsage(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100
}

/**
 * Get detailed memory statistics
 */
export function getMemoryStats(): {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  available: number
} {
  const usage = process.memoryUsage()
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
    available: Math.round((process.memoryUsage().heapTotal - process.memoryUsage().heapUsed) / 1024 / 1024 * 100) / 100
  }
}

/**
 * Check if memory usage exceeds limit
 */
export function isMemoryLimitExceeded(limitMB: number): boolean {
  return getMemoryUsage() > limitMB
}

/**
 * Force garbage collection if available
 */
export function forceGarbageCollection(): void {
  if (global.gc) {
    global.gc()
  }
}

/**
 * Monitor memory usage and call callback when threshold is exceeded
 */
export function monitorMemory(
  thresholdMB: number,
  callback: (usage: number) => void,
  intervalMs: number = 1000
): NodeJS.Timer {
  return setInterval(() => {
    const usage = getMemoryUsage()
    if (usage > thresholdMB) {
      callback(usage)
    }
  }, intervalMs)
}

/**
 * Create a memory-aware batch processor
 */
export function createMemoryAwareBatcher<T>(
  memoryLimitMB: number,
  processor: (batch: T[]) => Promise<void>
): {
  add: (item: T) => Promise<void>
  flush: () => Promise<void>
  getCurrentBatch: () => T[]
} {
  let batch: T[] = []
  
  return {
    add: async (item: T) => {
      batch.push(item)
      
      // Check memory limit and process batch if exceeded
      if (isMemoryLimitExceeded(memoryLimitMB)) {
        await processor([...batch])
        batch = []
        forceGarbageCollection()
      }
    },
    
    flush: async () => {
      if (batch.length > 0) {
        await processor([...batch])
        batch = []
        forceGarbageCollection()
      }
    },
    
    getCurrentBatch: () => [...batch]
  }
}