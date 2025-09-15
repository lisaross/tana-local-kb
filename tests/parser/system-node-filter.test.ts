/**
 * Tests for system node filtering functionality
 */

import { describe, it, expect } from 'bun:test'
import { isSystemNode, filterNodes, getNodeStatistics } from '../../server/src/parser/filters/system-node-filter'
import type { RawTanaNode } from '../../server/src/parser/types'

describe('System Node Filter', () => {
  describe('isSystemNode', () => {
    it('should identify nodes with sys: true as system nodes', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'Test Node',
        created: Date.now() / 1000,
        sys: true
      }
      
      expect(isSystemNode(node)).toBe(true)
    })
    
    it('should identify nodes with SYS_ prefix in ID as system nodes', () => {
      const node: RawTanaNode = {
        id: 'SYS_test-1',
        name: 'Test Node',
        created: Date.now() / 1000
      }
      
      expect(isSystemNode(node)).toBe(true)
    })
    
    it('should identify nodes with SYS_ prefix in name as system nodes', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'SYS_Test Node',
        created: Date.now() / 1000
      }
      
      expect(isSystemNode(node)).toBe(true)
    })
    
    it('should identify common system node names', () => {
      const systemNames = ['System', 'Templates', 'Daily notes', 'Inbox', 'Home']
      
      systemNames.forEach(name => {
        const node: RawTanaNode = {
          id: 'test-1',
          name,
          created: Date.now() / 1000
        }
        
        expect(isSystemNode(node)).toBe(true)
      })
    })
    
    it('should identify system docTypes', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'Test Node',
        created: Date.now() / 1000,
        docType: 'template'
      }
      
      expect(isSystemNode(node)).toBe(true)
    })
    
    it('should identify system properties', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'Test Node',
        created: Date.now() / 1000,
        props: {
          isSystem: true
        }
      }
      
      expect(isSystemNode(node)).toBe(true)
    })
    
    it('should not identify regular nodes as system nodes', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'My Personal Note',
        created: Date.now() / 1000,
        docType: 'note'
      }
      
      expect(isSystemNode(node)).toBe(false)
    })
  })
  
  describe('filterNodes', () => {
    const createTestNodes = (): RawTanaNode[] => [
      {
        id: 'user-1',
        name: 'My Note',
        created: Date.now() / 1000
      },
      {
        id: 'SYS_1',
        name: 'System Node',
        created: Date.now() / 1000
      },
      {
        id: 'user-2',
        name: 'Another Note',
        created: Date.now() / 1000,
        props: { important: true }
      },
      {
        id: 'template-1',
        name: 'Templates',
        created: Date.now() / 1000
      }
    ]
    
    it('should filter out system nodes when skipSystemNodes is true', () => {
      const nodes = createTestNodes()
      const filtered = filterNodes(nodes, { skipSystemNodes: true })
      
      expect(filtered).toHaveLength(2)
      expect(filtered.every(node => !isSystemNode(node))).toBe(true)
    })
    
    it('should keep system nodes when skipSystemNodes is false', () => {
      const nodes = createTestNodes()
      const filtered = filterNodes(nodes, { skipSystemNodes: false })
      
      expect(filtered).toHaveLength(4)
    })
    
    it('should apply custom filter', () => {
      const nodes = createTestNodes()
      const customFilter = (node: RawTanaNode) => node.name.includes('My')
      const filtered = filterNodes(nodes, { customFilter })
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('My Note')
    })
    
    it('should filter by included fields', () => {
      const nodes = createTestNodes()
      const filtered = filterNodes(nodes, { includeFields: ['important'] })
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('user-2')
    })
    
    it('should filter by excluded fields', () => {
      const nodes = createTestNodes()
      const filtered = filterNodes(nodes, { excludeFields: ['important'] })
      
      expect(filtered).toHaveLength(3)
      expect(filtered.every(node => !node.props?.important)).toBe(true)
    })
  })
  
  describe('getNodeStatistics', () => {
    it('should calculate correct statistics', () => {
      const nodes: RawTanaNode[] = [
        { id: 'user-1', name: 'User Note', created: Date.now() / 1000 },
        { id: 'SYS_1', name: 'System Node', created: Date.now() / 1000 },
        { id: 'user-2', name: 'Another User Note', created: Date.now() / 1000 },
        { id: 'template-1', name: 'Templates', created: Date.now() / 1000 }
      ]
      
      const stats = getNodeStatistics(nodes)
      
      expect(stats.total).toBe(4)
      expect(stats.systemNodes).toBe(2)
      expect(stats.userNodes).toBe(2)
      expect(stats.systemPercentage).toBe(50)
    })
    
    it('should handle empty array', () => {
      const stats = getNodeStatistics([])
      
      expect(stats.total).toBe(0)
      expect(stats.systemNodes).toBe(0)
      expect(stats.userNodes).toBe(0)
      expect(stats.systemPercentage).toBe(0)
    })
  })
})