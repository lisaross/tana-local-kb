/**
 * Tests for memory management utilities
 */

import { describe, it, expect } from 'bun:test'
import { getMemoryUsage, getMemoryStats, isMemoryLimitExceeded, createMemoryAwareBatcher } from '../../server/src/parser/utils/memory'

describe('Memory Utilities', () => {
  describe('getMemoryUsage', () => {
    it('should return memory usage as number', () => {
      const usage = getMemoryUsage()
      
      expect(typeof usage).toBe('number')
      expect(usage).toBeGreaterThan(0)
    })
  })
  
  describe('getMemoryStats', () => {
    it('should return detailed memory statistics', () => {
      const stats = getMemoryStats()
      
      expect(stats).toHaveProperty('heapUsed')
      expect(stats).toHaveProperty('heapTotal')
      expect(stats).toHaveProperty('external')
      expect(stats).toHaveProperty('rss')
      expect(stats).toHaveProperty('available')
      
      expect(typeof stats.heapUsed).toBe('number')
      expect(typeof stats.heapTotal).toBe('number')
      expect(typeof stats.external).toBe('number')
      expect(typeof stats.rss).toBe('number')
      expect(typeof stats.available).toBe('number')
      
      expect(stats.heapUsed).toBeGreaterThan(0)
      expect(stats.heapTotal).toBeGreaterThan(0)
    })
  })
  
  describe('isMemoryLimitExceeded', () => {
    it('should return false for very high limits', () => {
      const exceeded = isMemoryLimitExceeded(10000) // 10GB limit
      
      expect(exceeded).toBe(false)
    })
    
    it('should return true for very low limits', () => {
      const currentUsage = getMemoryUsage()
      // Use a very low limit that should definitely be exceeded
      const exceeded = isMemoryLimitExceeded(0.1) // 0.1MB limit
      
      expect(exceeded).toBe(true)
    })
  })
  
  describe('createMemoryAwareBatcher', () => {
    it('should create a batcher that processes items', async () => {
      const processed: string[] = []
      const memoryLimit = 1000 // High limit to avoid triggering
      
      const processor = async (batch: string[]) => {
        processed.push(...batch)
      }
      
      const batcher = createMemoryAwareBatcher(memoryLimit, processor)
      
      await batcher.add('item1')
      await batcher.add('item2')
      await batcher.flush()
      
      expect(processed).toEqual(['item1', 'item2'])
    })
    
    it('should return current batch correctly', async () => {
      const processor = async (batch: string[]) => {
        // Do nothing
      }
      
      const batcher = createMemoryAwareBatcher(1000, processor)
      
      await batcher.add('item1')
      await batcher.add('item2')
      
      const currentBatch = batcher.getCurrentBatch()
      expect(currentBatch).toEqual(['item1', 'item2'])
    })
    
    it('should clear batch after flush', async () => {
      const processor = async (batch: string[]) => {
        // Do nothing
      }
      
      const batcher = createMemoryAwareBatcher(1000, processor)
      
      await batcher.add('item1')
      await batcher.flush()
      
      const currentBatch = batcher.getCurrentBatch()
      expect(currentBatch).toEqual([])
    })
  })
})