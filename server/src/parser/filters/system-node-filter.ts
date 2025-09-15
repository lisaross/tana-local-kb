/**
 * System node filtering logic
 * Filters out Tana system nodes based on various criteria
 */

import { RawTanaNode } from '../types'

/**
 * Check if a node is a system node based on multiple criteria
 */
export function isSystemNode(node: RawTanaNode): boolean {
  // Check if explicitly marked as system node
  if (node.sys === true) {
    return true
  }
  
  // Check for SYS_ prefix in ID
  if (node.id && node.id.startsWith('SYS_')) {
    return true
  }
  
  // Check for SYS_ prefix in name
  if (node.name && node.name.startsWith('SYS_')) {
    return true
  }
  
  // Check for common system node names
  const systemNodeNames = [
    'System',
    'Templates',
    'Daily notes',
    'Inbox',
    'Home',
    'Library',
    'Schema',
    'Configuration',
    'Settings',
    'Workspace',
    'All pages',
    'Supertags',
    'Fields',
    'Trash'
  ]
  
  if (node.name && systemNodeNames.includes(node.name)) {
    return true
  }
  
  // Check for system node types
  const systemTypes = [
    'system',
    'template',
    'schema',
    'config',
    'workspace'
  ]
  
  if (node.type && systemTypes.includes(node.type)) {
    return true
  }
  
  // Check for system docTypes
  if (node.docType) {
    const systemDocTypes = [
      'system',
      'template',
      'schema',
      'workspace',
      'supertag',
      'field'
    ]
    
    if (systemDocTypes.includes(node.docType.toLowerCase())) {
      return true
    }
  }
  
  // Check for system-related properties
  if (node.props) {
    // Check for system properties
    const systemProps = ['isSystem', 'systemNode', 'template', 'schema']
    for (const prop of systemProps) {
      if (node.props[prop] === true) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Filter nodes based on system node criteria and custom filters
 */
export function filterNodes(
  nodes: RawTanaNode[],
  options: {
    skipSystemNodes?: boolean
    customFilter?: (node: RawTanaNode) => boolean
    includeFields?: string[]
    excludeFields?: string[]
  } = {}
): RawTanaNode[] {
  return nodes.filter(node => {
    // Apply system node filter
    if (options.skipSystemNodes && isSystemNode(node)) {
      return false
    }
    
    // Apply custom filter
    if (options.customFilter && !options.customFilter(node)) {
      return false
    }
    
    // Apply field inclusion filter
    if (options.includeFields && options.includeFields.length > 0) {
      const hasRequiredField = options.includeFields.some(field => {
        return node.props && Object.prototype.hasOwnProperty.call(node.props, field)
      })
      if (!hasRequiredField) {
        return false
      }
    }
    
    // Apply field exclusion filter
    if (options.excludeFields && options.excludeFields.length > 0) {
      const hasExcludedField = options.excludeFields.some(field => {
        return node.props && Object.prototype.hasOwnProperty.call(node.props, field)
      })
      if (hasExcludedField) {
        return false
      }
    }
    
    return true
  })
}

/**
 * Get statistics about system vs user nodes
 */
export function getNodeStatistics(nodes: RawTanaNode[]): {
  total: number
  systemNodes: number
  userNodes: number
  systemPercentage: number
} {
  const total = nodes.length
  const systemNodes = nodes.filter(isSystemNode).length
  const userNodes = total - systemNodes
  const systemPercentage = total > 0 ? (systemNodes / total) * 100 : 0
  
  return {
    total,
    systemNodes,
    userNodes,
    systemPercentage: Math.round(systemPercentage * 100) / 100
  }
}