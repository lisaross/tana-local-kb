/**
 * Node processing utilities for transforming raw Tana nodes
 */

import { RawTanaNode, TanaNode } from '../types'
import { isSystemNode } from '../filters/system-node-filter'

/**
 * Process a raw Tana node into a standardized format
 */
export function processRawNode(rawNode: RawTanaNode, options: {
  preserveRawData?: boolean
  normalizeContent?: boolean
} = {}): TanaNode {
  const {
    preserveRawData = false,
    normalizeContent = true
  } = options
  
  // Extract and normalize basic properties
  const id = rawNode.id || ''
  const name = rawNode.name || ''
  // Handle both seconds and milliseconds timestamps
  const createdInput = Number(rawNode.created) || 0
  const createdMs = createdInput > 1e12 ? createdInput : createdInput * 1000
  const created = new Date(createdMs)
  const docType = rawNode.docType || null
  const ownerId = rawNode.ownerId || null
  const children = rawNode.children || []
  const references = rawNode.refs || []
  
  // Determine node type
  let type: 'node' | 'field' | 'reference' = 'node'
  if (rawNode.type) {
    type = rawNode.type
  } else if (rawNode.dataType) {
    type = 'field'
  }
  
  // Process content
  let content = name
  if (normalizeContent) {
    content = normalizeNodeContent(name, rawNode.props)
  }
  
  // Merge props and fieldProps
  const fields: Record<string, any> = {
    ...rawNode.props,
    ...rawNode.fieldProps
  }
  
  // Clean up undefined/null values
  Object.keys(fields).forEach(key => {
    if (fields[key] === undefined || fields[key] === null) {
      delete fields[key]
    }
  })
  
  const processedNode: TanaNode = {
    id,
    name,
    content,
    created,
    docType,
    ownerId,
    children,
    references,
    fields,
    type,
    isSystemNode: isSystemNode(rawNode),
    ...(preserveRawData && { raw: rawNode })
  }
  
  return processedNode
}

/**
 * Normalize node content by extracting meaningful text
 */
function normalizeNodeContent(name: string, props?: Record<string, any>): string {
  let content = name.trim()
  
  // If name is empty but there are props, try to extract content
  if (!content && props) {
    // Look for common content properties
    const contentProps = ['content', 'text', 'body', 'description', 'value']
    
    for (const prop of contentProps) {
      if (props[prop] && typeof props[prop] === 'string') {
        content = props[prop].trim()
        break
      }
    }
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*[-*+]\s*/, '') // Remove list markers
    .replace(/^#+\s*/, '') // Remove markdown headers
    .trim()
  
  return content
}

/**
 * Extract references from node content and properties
 */
export function extractReferences(node: RawTanaNode): string[] {
  const references = new Set<string>()
  
  // Add explicit refs
  if (node.refs) {
    node.refs.forEach(ref => references.add(ref))
  }
  
  // Extract references from content using patterns
  const content = node.name || ''
  
  // Extract [[wikilinks]]
  const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g)
  if (wikiLinks) {
    wikiLinks.forEach(link => {
      const ref = link.replace(/\[\[|\]\]/g, '').trim()
      if (ref) {
        references.add(ref)
      }
    })
  }
  
  // Extract #tags
  const tags = content.match(/#[^\s#]+/g)
  if (tags) {
    tags.forEach(tag => {
      const ref = tag.substring(1) // Remove # prefix
      if (ref) {
        references.add(ref)
      }
    })
  }
  
  // Extract @mentions
  const mentions = content.match(/@[^\s@]+/g)
  if (mentions) {
    mentions.forEach(mention => {
      const ref = mention.substring(1) // Remove @ prefix
      if (ref) {
        references.add(ref)
      }
    })
  }
  
  // Check properties for references
  if (node.props) {
    Object.values(node.props).forEach(value => {
      if (typeof value === 'string' && value.match(/^[a-zA-Z0-9_-]+$/)) {
        // Looks like an ID
        references.add(value)
      }
    })
  }
  
  return Array.from(references)
}

/**
 * Validate that a processed node has required properties
 */
export function validateNode(node: TanaNode): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!node.id) {
    errors.push('Node missing required id property')
  }
  
  if (!node.name && !node.content) {
    errors.push('Node missing both name and content')
  }
  
  if (!node.created || isNaN(node.created.getTime())) {
    errors.push('Node has invalid created date')
  }
  
  if (!['node', 'field', 'reference'].includes(node.type)) {
    errors.push(`Node has invalid type: ${node.type}`)
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Batch process multiple raw nodes
 */
export function batchProcessNodes(
  rawNodes: RawTanaNode[], 
  options: {
    preserveRawData?: boolean
    normalizeContent?: boolean
    validateNodes?: boolean
  } = {}
): { 
  nodes: TanaNode[]
  errors: { nodeId: string; errors: string[] }[]
} {
  const nodes: TanaNode[] = []
  const errors: { nodeId: string; errors: string[] }[] = []
  
  for (const rawNode of rawNodes) {
    try {
      const processedNode = processRawNode(rawNode, options)
      
      if (options.validateNodes) {
        const validation = validateNode(processedNode)
        if (!validation.isValid) {
          errors.push({
            nodeId: rawNode.id || 'unknown',
            errors: validation.errors
          })
          continue
        }
      }
      
      nodes.push(processedNode)
    } catch (error) {
      errors.push({
        nodeId: rawNode.id || 'unknown',
        errors: [error instanceof Error ? error.message : 'Unknown processing error']
      })
    }
  }
  
  return { nodes, errors }
}