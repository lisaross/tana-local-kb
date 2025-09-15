/**
 * Tests for node processing functionality
 */

import { describe, it, expect } from 'bun:test'
import { processRawNode, extractReferences, validateNode, batchProcessNodes } from '../../server/src/parser/utils/node-processor'
import type { RawTanaNode } from '../../server/src/parser/types'

describe('Node Processor', () => {
  describe('processRawNode', () => {
    it('should process a basic raw node correctly', () => {
      const rawNode: RawTanaNode = {
        id: 'test-1',
        name: 'My Test Node',
        created: 1640995200, // 2022-01-01 00:00:00 UTC
        docType: 'note',
        ownerId: 'user-123',
        children: ['child-1', 'child-2'],
        refs: ['ref-1', 'ref-2'],
        props: {
          importance: 'high',
          category: 'work'
        }
      }
      
      const processed = processRawNode(rawNode)
      
      expect(processed.id).toBe('test-1')
      expect(processed.name).toBe('My Test Node')
      expect(processed.content).toBe('My Test Node')
      expect(processed.created).toEqual(new Date(1640995200 * 1000))
      expect(processed.docType).toBe('note')
      expect(processed.ownerId).toBe('user-123')
      expect(processed.children).toEqual(['child-1', 'child-2'])
      expect(processed.references).toEqual(['ref-1', 'ref-2'])
      expect(processed.type).toBe('node')
      expect(processed.fields).toEqual({
        importance: 'high',
        category: 'work'
      })
      expect(processed.isSystemNode).toBe(false)
    })
    
    it('should handle nodes with missing optional fields', () => {
      const rawNode: RawTanaNode = {
        id: 'test-2',
        name: 'Minimal Node',
        created: 1640995200
      }
      
      const processed = processRawNode(rawNode)
      
      expect(processed.id).toBe('test-2')
      expect(processed.name).toBe('Minimal Node')
      expect(processed.docType).toBe(null)
      expect(processed.ownerId).toBe(null)
      expect(processed.children).toEqual([])
      expect(processed.references).toEqual([])
      expect(processed.fields).toEqual({})
    })
    
    it('should preserve raw data when requested', () => {
      const rawNode: RawTanaNode = {
        id: 'test-3',
        name: 'Test Node',
        created: 1640995200
      }
      
      const processed = processRawNode(rawNode, { preserveRawData: true })
      
      expect(processed.raw).toEqual(rawNode)
    })
    
    it('should not preserve raw data by default', () => {
      const rawNode: RawTanaNode = {
        id: 'test-4',
        name: 'Test Node',
        created: 1640995200
      }
      
      const processed = processRawNode(rawNode)
      
      expect(processed.raw).toEqual({})
    })
    
    it('should detect field type nodes', () => {
      const rawNode: RawTanaNode = {
        id: 'field-1',
        name: 'My Field',
        created: 1640995200,
        dataType: 'string'
      }
      
      const processed = processRawNode(rawNode)
      
      expect(processed.type).toBe('field')
    })
  })
  
  describe('extractReferences', () => {
    it('should extract wikilinks from content', () => {
      const node: RawTanaNode = {
        id: 'test-1',
        name: 'Check out [[Another Note]] and [[Third Note]]',
        created: Date.now() / 1000
      }
      
      const refs = extractReferences(node)
      
      expect(refs).toContain('Another Note')
      expect(refs).toContain('Third Note')
    })
    
    it('should extract hashtags from content', () => {
      const node: RawTanaNode = {
        id: 'test-2',
        name: 'This is about #javascript and #typescript',
        created: Date.now() / 1000
      }
      
      const refs = extractReferences(node)
      
      expect(refs).toContain('javascript')
      expect(refs).toContain('typescript')
    })
    
    it('should extract mentions from content', () => {
      const node: RawTanaNode = {
        id: 'test-3',
        name: 'Meeting with @john and @jane',
        created: Date.now() / 1000
      }
      
      const refs = extractReferences(node)
      
      expect(refs).toContain('john')
      expect(refs).toContain('jane')
    })
    
    it('should include explicit refs', () => {
      const node: RawTanaNode = {
        id: 'test-4',
        name: 'Simple note',
        created: Date.now() / 1000,
        refs: ['explicit-ref-1', 'explicit-ref-2']
      }
      
      const refs = extractReferences(node)
      
      expect(refs).toContain('explicit-ref-1')
      expect(refs).toContain('explicit-ref-2')
    })
    
    it('should return unique references only', () => {
      const node: RawTanaNode = {
        id: 'test-5',
        name: '[[Duplicate]] and [[Duplicate]] again',
        created: Date.now() / 1000,
        refs: ['Duplicate']
      }
      
      const refs = extractReferences(node)
      
      expect(refs.filter(ref => ref === 'Duplicate')).toHaveLength(1)
    })
  })
  
  describe('validateNode', () => {
    it('should validate a correct node', () => {
      const node = {
        id: 'test-1',
        name: 'Valid Node',
        content: 'Valid content',
        created: new Date(),
        docType: null,
        ownerId: null,
        children: [],
        references: [],
        fields: {},
        type: 'node' as const,
        isSystemNode: false,
        raw: {}
      }
      
      const validation = validateNode(node)
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
    
    it('should detect missing id', () => {
      const node = {
        id: '',
        name: 'Node without ID',
        content: 'Content',
        created: new Date(),
        docType: null,
        ownerId: null,
        children: [],
        references: [],
        fields: {},
        type: 'node' as const,
        isSystemNode: false,
        raw: {}
      }
      
      const validation = validateNode(node)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Node missing required id property')
    })
    
    it('should detect missing name and content', () => {
      const node = {
        id: 'test-1',
        name: '',
        content: '',
        created: new Date(),
        docType: null,
        ownerId: null,
        children: [],
        references: [],
        fields: {},
        type: 'node' as const,
        isSystemNode: false,
        raw: {}
      }
      
      const validation = validateNode(node)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Node missing both name and content')
    })
    
    it('should detect invalid date', () => {
      const node = {
        id: 'test-1',
        name: 'Valid Node',
        content: 'Valid content',
        created: new Date('invalid'),
        docType: null,
        ownerId: null,
        children: [],
        references: [],
        fields: {},
        type: 'node' as const,
        isSystemNode: false,
        raw: {}
      }
      
      const validation = validateNode(node)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Node has invalid created date')
    })
  })
  
  describe('batchProcessNodes', () => {
    it('should process multiple nodes successfully', () => {
      const rawNodes: RawTanaNode[] = [
        {
          id: 'test-1',
          name: 'First Node',
          created: Date.now() / 1000
        },
        {
          id: 'test-2',
          name: 'Second Node',
          created: Date.now() / 1000
        }
      ]
      
      const { nodes, errors } = batchProcessNodes(rawNodes)
      
      expect(nodes).toHaveLength(2)
      expect(errors).toHaveLength(0)
      expect(nodes[0].name).toBe('First Node')
      expect(nodes[1].name).toBe('Second Node')
    })
    
    it('should handle processing errors gracefully', () => {
      const rawNodes: RawTanaNode[] = [
        {
          id: 'test-1',
          name: 'Valid Node',
          created: Date.now() / 1000
        },
        {
          id: '', // Invalid: missing ID
          name: '',
          created: Date.now() / 1000
        }
      ]
      
      const { nodes, errors } = batchProcessNodes(rawNodes, { validateNodes: true })
      
      expect(nodes).toHaveLength(1)
      expect(errors).toHaveLength(1)
      expect(errors[0].errors).toContain('Node missing required id property')
    })
  })
})