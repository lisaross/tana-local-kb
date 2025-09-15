/**
 * Edge case tests for the streaming JSON parser
 * Tests unusual scenarios, malformed data, and boundary conditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { unlinkSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { StreamParser, parseFile } from '../../server/src/parser'
import { ParseError, MemoryLimitError } from '../../server/src/parser/types'
import { generateTestFile } from './test-data-generator'

const TEST_DATA_DIR = join(process.cwd(), 'tests/data/edge-cases')
const EDGE_CASE_FILES = {
  EMPTY: join(TEST_DATA_DIR, 'empty.json'),
  INVALID_JSON: join(TEST_DATA_DIR, 'invalid.json'),
  NO_NODES: join(TEST_DATA_DIR, 'no-nodes.json'),
  SINGLE_NODE: join(TEST_DATA_DIR, 'single-node.json'),
  HUGE_SINGLE_NODE: join(TEST_DATA_DIR, 'huge-single-node.json'),
  DEEPLY_NESTED: join(TEST_DATA_DIR, 'deeply-nested.json'),
  UNICODE_HEAVY: join(TEST_DATA_DIR, 'unicode-heavy.json'),
  MALFORMED_STRUCTURE: join(TEST_DATA_DIR, 'malformed-structure.json'),
  MIXED_ENCODING: join(TEST_DATA_DIR, 'mixed-encoding.json'),
  CIRCULAR_REFS: join(TEST_DATA_DIR, 'circular-refs.json')
}

describe('Edge Case Tests', () => {
  beforeAll(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true })
    
    // Create edge case test files
    createEdgeCaseTestFiles()
  })
  
  afterAll(() => {
    // Clean up test files
    Object.values(EDGE_CASE_FILES).forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    })
  })

  describe('Empty and Invalid Files', () => {
    it('should handle completely empty files', async () => {
      const result = await parseFile(EDGE_CASE_FILES.EMPTY)
      
      expect(result.nodes).toEqual([])
      expect(result.statistics.totalNodes).toBe(0)
      expect(result.statistics.processedNodes).toBe(0)
      expect(result.statistics.errors).toBe(0)
      expect(result.errors).toEqual([])
    })
    
    it('should handle invalid JSON gracefully', async () => {
      await expect(
        parseFile(EDGE_CASE_FILES.INVALID_JSON, {
          continueOnError: false
        })
      ).rejects.toThrow(ParseError)
    })
    
    it('should handle files with no nodes array', async () => {
      const result = await parseFile(EDGE_CASE_FILES.NO_NODES, {
        continueOnError: true
      })
      
      expect(result.nodes).toEqual([])
      expect(result.statistics.totalNodes).toBe(0)
    })
    
    it('should handle files with single node', async () => {
      const result = await parseFile(EDGE_CASE_FILES.SINGLE_NODE)
      
      expect(result.nodes).toHaveLength(1)
      expect(result.statistics.totalNodes).toBe(1)
      expect(result.statistics.processedNodes).toBe(1)
      expect(result.nodes[0].id).toBe('single-node-id')
      expect(result.nodes[0].name).toBe('Single Test Node')
    })
  })

  describe('Large Individual Nodes', () => {
    it('should handle extremely large individual nodes', async () => {
      const startMemory = process.memoryUsage().heapUsed / 1024 / 1024
      
      const result = await parseFile(EDGE_CASE_FILES.HUGE_SINGLE_NODE, {
        memoryLimit: 100,
        batchSize: 1 // Force processing one at a time
      })
      
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].content.length).toBeGreaterThan(100000) // Very large content
      expect(result.statistics.memoryPeak).toBeLessThan(100)
      
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024
      const memoryGrowth = endMemory - startMemory
      expect(memoryGrowth).toBeLessThan(50) // Should not retain excessive memory
    })
    
    it('should handle nodes with massive arrays', async () => {
      const massiveArrayNode = {
        version: "1.0",
        nodes: [{
          id: "massive-array-node",
          name: "Node with massive arrays",
          created: Date.now(),
          children: Array.from({ length: 10000 }, (_, i) => `child_${i}`),
          refs: Array.from({ length: 5000 }, (_, i) => `ref_${i}`),
          props: {
            tags: Array.from({ length: 1000 }, (_, i) => `tag_${i}`)
          }
        }]
      }
      
      const massiveArrayFile = join(TEST_DATA_DIR, 'massive-arrays.json')
      writeFileSync(massiveArrayFile, JSON.stringify(massiveArrayNode))
      
      try {
        const result = await parseFile(massiveArrayFile, {
          memoryLimit: 100
        })
        
        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].children).toHaveLength(10000)
        expect(result.nodes[0].references).toHaveLength(5000)
        
      } finally {
        if (existsSync(massiveArrayFile)) {
          unlinkSync(massiveArrayFile)
        }
      }
    })
  })

  describe('Malformed and Corrupted Data', () => {
    it('should handle various JSON malformations', async () => {
      const malformations = [
        '{"nodes":[{"id":"1","name":"test",}]}', // Trailing comma
        '{"nodes":[{"id":"1""name":"test"}]}', // Missing comma
        '{"nodes":[{"id":"1","name":test"}]}', // Unquoted value
        '{"nodes":[{"id":"1","name":"test"}', // Missing closing brackets
        '{"nodes":[{id":"1","name":"test"}]}', // Unquoted key
      ]
      
      for (const malformed of malformations) {
        const testFile = join(TEST_DATA_DIR, 'temp-malformed.json')
        writeFileSync(testFile, malformed)
        
        try {
          const result = await parseFile(testFile, {
            continueOnError: true,
            maxErrors: 10
          })
          
          // Should have recorded errors but not crashed
          expect(result.errors.length).toBeGreaterThan(0)
          
        } finally {
          if (existsSync(testFile)) {
            unlinkSync(testFile)
          }
        }
      }
    })
    
    it('should handle deeply nested malformed structures', async () => {
      const result = await parseFile(EDGE_CASE_FILES.MALFORMED_STRUCTURE, {
        continueOnError: true,
        maxErrors: 100
      })
      
      // Should process valid nodes and skip invalid ones
      expect(result.nodes.length).toBeGreaterThanOrEqual(0)
      expect(result.errors.length).toBeGreaterThan(0)
      
      // All errors should be ParseError instances
      result.errors.forEach(error => {
        expect(error).toBeInstanceOf(ParseError)
        expect(error.message).toBeDefined()
      })
    })
    
    it('should handle mixed valid and invalid nodes', async () => {
      const mixedData = {
        version: "1.0",
        nodes: [
          { id: "valid1", name: "Valid Node 1", created: Date.now() },
          '{"id":"malformed1","name":"Missing quotes}',
          { id: "valid2", name: "Valid Node 2", created: Date.now() },
          { id: "incomplete", name: "Incomplete Node" }, // Missing created field
          { id: "valid3", name: "Valid Node 3", created: Date.now() }
        ]
      }
      
      // Convert to string and inject malformed JSON
      let jsonString = JSON.stringify(mixedData, null, 2)
      jsonString = jsonString.replace('"{\\"id\\":\\"malformed1\\",\\"name\\":\\"Missing quotes}"', '{"id":"malformed1","name":"Missing quotes}')
      
      const mixedFile = join(TEST_DATA_DIR, 'mixed-validity.json')
      writeFileSync(mixedFile, jsonString)
      
      try {
        const result = await parseFile(mixedFile, {
          continueOnError: true,
          maxErrors: 10
        })
        
        // Should have processed some valid nodes
        expect(result.nodes.length).toBeGreaterThan(0)
        expect(result.nodes.length).toBeLessThan(5) // Some should have failed
        
        // Should have recorded errors
        expect(result.errors.length).toBeGreaterThan(0)
        
      } finally {
        if (existsSync(mixedFile)) {
          unlinkSync(mixedFile)
        }
      }
    })
  })

  describe('Unicode and Encoding Issues', () => {
    it('should handle unicode characters correctly', async () => {
      const result = await parseFile(EDGE_CASE_FILES.UNICODE_HEAVY)
      
      expect(result.nodes.length).toBeGreaterThan(0)
      
      // Check that unicode characters are preserved
      const unicodeNode = result.nodes.find(node => 
        node.name.includes('🚀') || 
        node.name.includes('测试') || 
        node.content.includes('العربية')
      )
      expect(unicodeNode).toBeDefined()
    })
    
    it('should handle special characters in node content', async () => {
      const specialCharsData = {
        version: "1.0",
        nodes: [{
          id: "special-chars",
          name: "Node with special chars: <>&\"'",
          created: Date.now(),
          props: {
            content: "Content with \n newlines \t tabs \r returns and \"quotes\" and 'apostrophes'"
          }
        }]
      }
      
      const specialCharsFile = join(TEST_DATA_DIR, 'special-chars.json')
      writeFileSync(specialCharsFile, JSON.stringify(specialCharsData))
      
      try {
        const result = await parseFile(specialCharsFile)
        
        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].name).toContain('<>&"\'')
        expect(result.nodes[0].content).toContain('\n')
        expect(result.nodes[0].content).toContain('\t')
        
      } finally {
        if (existsSync(specialCharsFile)) {
          unlinkSync(specialCharsFile)
        }
      }
    })
  })

  describe('Circular References and Complex Structures', () => {
    it('should handle circular references', async () => {
      const result = await parseFile(EDGE_CASE_FILES.CIRCULAR_REFS)
      
      expect(result.nodes.length).toBeGreaterThan(0)
      
      // Verify nodes reference each other
      const nodeA = result.nodes.find(n => n.id === 'node-a')
      const nodeB = result.nodes.find(n => n.id === 'node-b')
      
      if (nodeA && nodeB) {
        expect(nodeA.references).toContain('node-b')
        expect(nodeB.references).toContain('node-a')
      }
    })
    
    it('should handle deeply nested structures', async () => {
      const result = await parseFile(EDGE_CASE_FILES.DEEPLY_NESTED)
      
      expect(result.nodes.length).toBeGreaterThan(0)
      
      // Should process all nodes without stack overflow
      const deepNode = result.nodes.find(node => 
        node.fields && 
        typeof node.fields.nested === 'object'
      )
      expect(deepNode).toBeDefined()
    })
    
    it('should handle self-referencing nodes', async () => {
      const selfRefData = {
        version: "1.0",
        nodes: [{
          id: "self-ref",
          name: "Self-referencing node",
          created: Date.now(),
          children: ["self-ref"],
          refs: ["self-ref"]
        }]
      }
      
      const selfRefFile = join(TEST_DATA_DIR, 'self-ref.json')
      writeFileSync(selfRefFile, JSON.stringify(selfRefData))
      
      try {
        const result = await parseFile(selfRefFile)
        
        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].children).toContain('self-ref')
        expect(result.nodes[0].references).toContain('self-ref')
        
      } finally {
        if (existsSync(selfRefFile)) {
          unlinkSync(selfRefFile)
        }
      }
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle zero-length strings', async () => {
      const emptyStringData = {
        version: "1.0",
        nodes: [{
          id: "",
          name: "",
          created: Date.now(),
          props: { content: "" }
        }]
      }
      
      const emptyStringFile = join(TEST_DATA_DIR, 'empty-strings.json')
      writeFileSync(emptyStringFile, JSON.stringify(emptyStringData))
      
      try {
        const result = await parseFile(emptyStringFile, {
          continueOnError: true
        })
        
        // Should handle empty strings gracefully
        if (result.nodes.length > 0) {
          expect(result.nodes[0].id).toBe("")
          expect(result.nodes[0].name).toBe("")
        }
        
      } finally {
        if (existsSync(emptyStringFile)) {
          unlinkSync(emptyStringFile)
        }
      }
    })
    
    it('should handle null and undefined values', async () => {
      const nullData = {
        version: "1.0",
        nodes: [{
          id: "null-test",
          name: null,
          created: Date.now(),
          docType: undefined,
          children: null,
          refs: undefined
        }]
      }
      
      const nullFile = join(TEST_DATA_DIR, 'null-values.json')
      // Manually create JSON to include null values
      writeFileSync(nullFile, `{
        "version": "1.0",
        "nodes": [{
          "id": "null-test",
          "name": null,
          "created": ${Date.now()},
          "docType": null,
          "children": null,
          "refs": null
        }]
      }`)
      
      try {
        const result = await parseFile(nullFile, {
          continueOnError: true
        })
        
        // Should handle null values appropriately
        if (result.nodes.length > 0) {
          const node = result.nodes[0]
          expect(node.id).toBe('null-test')
          // Nulls should be handled gracefully
          expect(node.children).toEqual([])
          expect(node.references).toEqual([])
        }
        
      } finally {
        if (existsSync(nullFile)) {
          unlinkSync(nullFile)
        }
      }
    })
    
    it('should handle extremely long property values', async () => {
      const longValue = 'x'.repeat(1000000) // 1MB string
      const longValueData = {
        version: "1.0",
        nodes: [{
          id: "long-value",
          name: "Node with long value",
          created: Date.now(),
          props: {
            longContent: longValue
          }
        }]
      }
      
      const longValueFile = join(TEST_DATA_DIR, 'long-values.json')
      writeFileSync(longValueFile, JSON.stringify(longValueData))
      
      try {
        const result = await parseFile(longValueFile, {
          memoryLimit: 100
        })
        
        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].fields.longContent).toHaveLength(1000000)
        
      } finally {
        if (existsSync(longValueFile)) {
          unlinkSync(longValueFile)
        }
      }
    })
  })

  describe('Network and I/O Simulation', () => {
    it('should handle file access errors gracefully', async () => {
      const nonExistentFile = join(TEST_DATA_DIR, 'does-not-exist.json')
      
      await expect(
        parseFile(nonExistentFile)
      ).rejects.toThrow()
    })
    
    it('should handle parser interruption', async () => {
      // Create a parser and interrupt it mid-parsing
      const parser = new StreamParser({
        batchSize: 100,
        progressInterval: 50
      })
      
      let parsePromise: Promise<any> | null = null
      let interrupted = false
      
      parser.on('node', () => {
        // Interrupt after processing some nodes
        if (!interrupted) {
          interrupted = true
          // Simulate interruption by not awaiting
          parser.removeAllListeners()
        }
      })
      
      try {
        parsePromise = parser.parseFile(EDGE_CASE_FILES.SINGLE_NODE)
        await parsePromise
      } catch (error) {
        // Interruption should be handled gracefully
        expect(error).toBeDefined()
      }
    })
  })

  describe('Memory Pressure Edge Cases', () => {
    it('should handle memory limit exactly at boundary', async () => {
      // Set memory limit to current usage + small buffer
      const currentMemory = Math.ceil(process.memoryUsage().heapUsed / 1024 / 1024)
      const tightLimit = currentMemory + 10 // Very tight limit
      
      await expect(
        parseFile(EDGE_CASE_FILES.HUGE_SINGLE_NODE, {
          memoryLimit: tightLimit,
          continueOnError: false
        })
      ).rejects.toThrow(MemoryLimitError)
    })
    
    it('should handle zero batch size gracefully', async () => {
      // Test with invalid batch size
      await expect(
        parseFile(EDGE_CASE_FILES.SINGLE_NODE, {
          batchSize: 0
        })
      ).rejects.toThrow()
    })
    
    it('should handle negative configuration values', async () => {
      // Test with invalid configuration
      await expect(
        parseFile(EDGE_CASE_FILES.SINGLE_NODE, {
          memoryLimit: -1
        })
      ).rejects.toThrow()
      
      await expect(
        parseFile(EDGE_CASE_FILES.SINGLE_NODE, {
          maxErrors: -1
        })
      ).rejects.toThrow()
    })
  })
})

function createEdgeCaseTestFiles() {
  // Empty file
  writeFileSync(EDGE_CASE_FILES.EMPTY, '')
  
  // Invalid JSON
  writeFileSync(EDGE_CASE_FILES.INVALID_JSON, '{"invalid": json content}')
  
  // No nodes array
  writeFileSync(EDGE_CASE_FILES.NO_NODES, '{"version": "1.0", "exported": "2023-01-01T00:00:00Z"}')
  
  // Single node
  const singleNode = {
    version: "1.0",
    nodes: [{
      id: "single-node-id",
      name: "Single Test Node",
      created: Date.now()
    }]
  }
  writeFileSync(EDGE_CASE_FILES.SINGLE_NODE, JSON.stringify(singleNode))
  
  // Huge single node
  const hugeNode = {
    version: "1.0",
    nodes: [{
      id: "huge-node",
      name: "Huge Test Node",
      created: Date.now(),
      props: {
        content: 'A'.repeat(500000) // 500KB of content
      }
    }]
  }
  writeFileSync(EDGE_CASE_FILES.HUGE_SINGLE_NODE, JSON.stringify(hugeNode))
  
  // Unicode heavy
  const unicodeNodes = {
    version: "1.0",
    nodes: [
      { id: "unicode1", name: "🚀 Rocket Node 测试", created: Date.now() },
      { id: "unicode2", name: "عربية اختبار", created: Date.now() },
      { id: "unicode3", name: "Русский тест", created: Date.now() },
      { id: "unicode4", name: "日本語テスト", created: Date.now() }
    ]
  }
  writeFileSync(EDGE_CASE_FILES.UNICODE_HEAVY, JSON.stringify(unicodeNodes))
  
  // Circular references
  const circularRefs = {
    version: "1.0",
    nodes: [
      { id: "node-a", name: "Node A", created: Date.now(), refs: ["node-b"] },
      { id: "node-b", name: "Node B", created: Date.now(), refs: ["node-a"] }
    ]
  }
  writeFileSync(EDGE_CASE_FILES.CIRCULAR_REFS, JSON.stringify(circularRefs))
  
  // Deeply nested
  const deepNested = {
    version: "1.0",
    nodes: [{
      id: "deep",
      name: "Deep Node",
      created: Date.now(),
      props: {
        nested: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: "Deep value"
                }
              }
            }
          }
        }
      }
    }]
  }
  writeFileSync(EDGE_CASE_FILES.DEEPLY_NESTED, JSON.stringify(deepNested))
  
  // Malformed structure
  const malformedStructure = `{
    "version": "1.0",
    "nodes": [
      {"id": "valid1", "name": "Valid Node", "created": ${Date.now()}},
      {"id": "malformed1", "name": "Missing comma" "created": ${Date.now()}},
      {"id": "valid2", "name": "Another Valid Node", "created": ${Date.now()}},
      {id: "malformed2", "name": "Unquoted key", "created": ${Date.now()}},
      {"id": "valid3", "name": "Final Valid Node", "created": ${Date.now()}}
    ]
  }`
  writeFileSync(EDGE_CASE_FILES.MALFORMED_STRUCTURE, malformedStructure)
}