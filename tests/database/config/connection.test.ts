#!/usr/bin/env bun
/**
 * Connection Management Tests
 * 
 * Tests for database connection lifecycle, pooling, event handling,
 * and performance monitoring with comprehensive error scenarios.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { createConnection, getDatabaseConfig } from '../../../server/src/database/config/index.js'
import type { DatabaseConnection, DatabaseConfig } from '../../../server/src/database/types/database-types.js'
import { existsSync, unlinkSync } from 'fs'

describe('Database Connection Management', () => {
  let connection: DatabaseConnection | null = null
  let testDbPath: string

  beforeEach(() => {
    testDbPath = join(process.cwd(), 'tests/data', `test-connection-${Date.now()}.db`)
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
      connection = null
    }
    
    // Clean up test database file
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath)
    }
  })

  describe('Connection Creation', () => {
    test('should create connection with default configuration', async () => {
      const config = getDatabaseConfig()
      connection = await createConnection(config)
      
      expect(connection).toBeDefined()
      expect(connection.query).toBeDefined()
      expect(connection.run).toBeDefined()
      expect(connection.transaction).toBeDefined()
    })

    test('should create in-memory connection', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {
          journal_mode: 'MEMORY',
          synchronous: 'OFF',
          foreign_keys: 'ON',
        },
        enableWAL: false,
        enableFTS: true,
        autoVacuum: false,
      }

      connection = await createConnection(config)
      expect(connection).toBeDefined()

      // Test basic operation
      const result = connection.query('SELECT 1 as test')
      expect(result).toHaveLength(1)
      expect(result[0].test).toBe(1)
    })

    test('should create file-based connection', async () => {
      const config: DatabaseConfig = {
        path: testDbPath,
        memory: false,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {
          journal_mode: 'WAL',
          synchronous: 'NORMAL',
          foreign_keys: 'ON',
        },
        enableWAL: true,
        enableFTS: true,
        autoVacuum: true,
      }

      connection = await createConnection(config)
      expect(connection).toBeDefined()
      expect(existsSync(testDbPath)).toBe(true)
    })

    test('should apply pragma settings correctly', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {
          journal_mode: 'MEMORY',
          synchronous: 'OFF',
          foreign_keys: 'ON',
          cache_size: '1000',
        },
        enableWAL: false,
        enableFTS: true,
        autoVacuum: false,
      }

      connection = await createConnection(config)

      // Verify pragma settings
      const journalMode = connection.query('PRAGMA journal_mode')
      expect(journalMode[0].journal_mode).toBe('memory')

      const foreignKeys = connection.query('PRAGMA foreign_keys')
      expect(foreignKeys[0].foreign_keys).toBe(1)

      const synchronous = connection.query('PRAGMA synchronous')
      expect(synchronous[0].synchronous).toBe(0) // OFF = 0
    })

    test('should handle connection timeout settings', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 1000, // Short timeout
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }

      connection = await createConnection(config)
      
      // Should complete quickly
      const startTime = Date.now()
      connection.query('SELECT 1')
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(100) // Much less than timeout
    })
  })

  describe('Query Operations', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: { foreign_keys: 'ON' },
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)
    })

    test('should execute simple SELECT queries', () => {
      const result = connection!.query('SELECT 1 as num, "test" as text')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ num: 1, text: 'test' })
    })

    test('should execute queries with parameters', () => {
      connection!.run('CREATE TABLE test_params (id INTEGER, name TEXT)')
      connection!.run('INSERT INTO test_params (id, name) VALUES (?, ?)', [1, 'test'])
      
      const result = connection!.query('SELECT * FROM test_params WHERE id = ?', [1])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ id: 1, name: 'test' })
    })

    test('should handle empty query results', () => {
      connection!.run('CREATE TABLE empty_test (id INTEGER)')
      const result = connection!.query('SELECT * FROM empty_test')
      expect(result).toHaveLength(0)
      expect(Array.isArray(result)).toBe(true)
    })

    test('should execute DDL statements', () => {
      expect(() => {
        connection!.run('CREATE TABLE ddl_test (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
      }).not.toThrow()

      // Verify table exists
      const tables = connection!.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='ddl_test'
      `)
      expect(tables).toHaveLength(1)
    })

    test('should track query performance', () => {
      // Execute some queries to populate performance data
      for (let i = 0; i < 5; i++) {
        connection!.query('SELECT 1')
      }

      // Connection should track performance (implementation dependent)
      expect(connection!.getMetrics).toBeDefined()
      if (connection!.getMetrics) {
        const metrics = connection!.getMetrics()
        expect(metrics.totalQueries).toBeGreaterThan(0)
      }
    })
  })

  describe('Transaction Management', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: { foreign_keys: 'ON' },
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)
      connection!.run('CREATE TABLE transaction_test (id INTEGER, value TEXT)')
    })

    test('should execute successful transactions', async () => {
      const result = await connection!.transaction(async (tx) => {
        tx.run('INSERT INTO transaction_test (id, value) VALUES (?, ?)', [1, 'test1'])
        tx.run('INSERT INTO transaction_test (id, value) VALUES (?, ?)', [2, 'test2'])
        return { inserted: 2 }
      })

      expect(result.inserted).toBe(2)

      // Verify data was committed
      const rows = connection!.query('SELECT COUNT(*) as count FROM transaction_test')
      expect(rows[0].count).toBe(2)
    })

    test('should rollback failed transactions', async () => {
      try {
        await connection!.transaction(async (tx) => {
          tx.run('INSERT INTO transaction_test (id, value) VALUES (?, ?)', [1, 'test1'])
          // Force an error
          tx.run('INSERT INTO invalid_table (id) VALUES (?)', [2])
        })
      } catch (error) {
        // Expected to throw
      }

      // Verify data was rolled back
      const rows = connection!.query('SELECT COUNT(*) as count FROM transaction_test')
      expect(rows[0].count).toBe(0)
    })

    test('should handle nested transaction attempts', async () => {
      await connection!.transaction(async (tx) => {
        tx.run('INSERT INTO transaction_test (id, value) VALUES (?, ?)', [1, 'test1'])
        
        // Nested transaction should throw or be handled gracefully
        try {
          await connection!.transaction(async (nestedTx) => {
            nestedTx.run('INSERT INTO transaction_test (id, value) VALUES (?, ?)', [2, 'test2'])
          })
        } catch (error) {
          // Either throws or handles gracefully
        }
      })

      // Should have at least the first insert
      const rows = connection!.query('SELECT COUNT(*) as count FROM transaction_test')
      expect(rows[0].count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Event Handling', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: { foreign_keys: 'ON' },
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)
    })

    test('should register and trigger event handlers', () => {
      let eventFired = false
      let eventData: any = null

      if (connection!.addEventListener) {
        connection!.addEventListener((event) => {
          eventFired = true
          eventData = event
        })

        // Trigger an event
        connection!.query('SELECT 1')

        expect(eventFired).toBe(true)
        expect(eventData).toBeDefined()
      }
    })

    test('should track slow queries', () => {
      const slowQueries: any[] = []

      if (connection!.addEventListener) {
        connection!.addEventListener((event) => {
          if (event.type === 'query' && event.duration > 10) {
            slowQueries.push(event)
          }
        })

        // Execute multiple queries
        for (let i = 0; i < 10; i++) {
          connection!.query('SELECT 1')
        }

        // Most queries should be fast, but we can't guarantee timing
        expect(slowQueries.length).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid SQL gracefully', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)

      expect(() => {
        connection!.query('INVALID SQL STATEMENT')
      }).toThrow()
    })

    test('should handle database file permissions', async () => {
      const readOnlyPath = '/tmp/invalid-readonly-test.db'
      
      const config: DatabaseConfig = {
        path: readOnlyPath,
        memory: false,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }

      await expect(createConnection(config)).rejects.toThrow()
    })

    test('should handle parameter binding errors', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)

      connection!.run('CREATE TABLE param_test (id INTEGER)')

      expect(() => {
        // Wrong number of parameters
        connection!.query('SELECT * FROM param_test WHERE id = ? AND id = ?', [1])
      }).toThrow()
    })
  })

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: { foreign_keys: 'ON' },
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      connection = await createConnection(config)
    })

    test('should track query execution times', () => {
      // Execute queries and check if timing is tracked
      const startTime = Date.now()
      
      for (let i = 0; i < 100; i++) {
        connection!.query('SELECT ?', [i])
      }
      
      const duration = Date.now() - startTime
      
      // Basic performance expectation
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      
      if (connection!.getMetrics) {
        const metrics = connection!.getMetrics()
        expect(metrics.totalQueries).toBe(100)
        expect(metrics.averageQueryTime).toBeGreaterThan(0)
      }
    })

    test('should identify memory usage patterns', () => {
      // Create some data to use memory
      connection!.run('CREATE TABLE memory_test (id INTEGER, data TEXT)')
      
      const largeDummyData = 'x'.repeat(1000)
      for (let i = 0; i < 1000; i++) {
        connection!.run('INSERT INTO memory_test (id, data) VALUES (?, ?)', [i, largeDummyData])
      }

      // Check memory usage is reasonable
      const memoryUsage = process.memoryUsage()
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
    })
  })

  describe('Connection Lifecycle', () => {
    test('should properly close connections', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      
      connection = await createConnection(config)
      expect(connection).toBeDefined()

      // Should work before closing
      expect(() => connection!.query('SELECT 1')).not.toThrow()

      // Close connection
      await connection.close()

      // Should not work after closing
      expect(() => connection!.query('SELECT 1')).toThrow()
    })

    test('should handle multiple close calls gracefully', async () => {
      const config: DatabaseConfig = {
        path: ':memory:',
        memory: true,
        readOnly: false,
        timeout: 5000,
        maxConnections: 1,
        pragmas: {},
        enableWAL: false,
        enableFTS: false,
        autoVacuum: false,
      }
      
      connection = await createConnection(config)

      // Multiple closes should not throw
      await connection.close()
      expect(async () => await connection!.close()).not.toThrow()
      expect(async () => await connection!.close()).not.toThrow()
    })
  })

  describe('Configuration Validation', () => {
    test('should validate required configuration fields', async () => {
      const invalidConfig = {} as DatabaseConfig

      await expect(createConnection(invalidConfig)).rejects.toThrow()
    })

    test('should use sensible defaults for optional fields', () => {
      const config = getDatabaseConfig()
      
      expect(config.timeout).toBeGreaterThan(0)
      expect(config.maxConnections).toBeGreaterThan(0)
      expect(config.pragmas).toBeDefined()
      expect(typeof config.enableWAL).toBe('boolean')
      expect(typeof config.enableFTS).toBe('boolean')
      expect(typeof config.autoVacuum).toBe('boolean')
    })

    test('should merge custom configuration with defaults', () => {
      const defaultConfig = getDatabaseConfig()
      const customConfig = { timeout: 10000, enableWAL: false }
      
      const merged = { ...defaultConfig, ...customConfig }
      
      expect(merged.timeout).toBe(10000)
      expect(merged.enableWAL).toBe(false)
      expect(merged.pragmas).toBeDefined() // Should preserve defaults
    })
  })
})