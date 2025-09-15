/**
 * Progress tracking utilities
 */

import { ParseProgress, ProgressCallback } from '../types'
import { getMemoryUsage } from './memory'

/**
 * Progress tracker class for monitoring parsing progress
 */
export class ProgressTracker {
  private startTime: number
  private totalNodes: number = 0
  private processedNodes: number = 0
  private skippedNodes: number = 0
  private currentNode?: string
  private lastReportTime: number = 0
  private callback?: ProgressCallback
  private reportInterval: number
  
  constructor(callback?: ProgressCallback, reportIntervalMs: number = 1000) {
    this.startTime = Date.now()
    this.lastReportTime = this.startTime
    this.callback = callback
    this.reportInterval = reportIntervalMs
  }
  
  /**
   * Set the total number of nodes to process
   */
  setTotal(total: number): void {
    this.totalNodes = total
    this.reportProgress(true) // Force initial report
  }
  
  /**
   * Increment processed nodes count
   */
  incrementProcessed(nodeId?: string): void {
    this.processedNodes++
    this.currentNode = nodeId
    this.reportProgress()
  }
  
  /**
   * Increment skipped nodes count
   */
  incrementSkipped(nodeId?: string): void {
    this.skippedNodes++
    this.currentNode = nodeId
    this.reportProgress()
  }
  
  /**
   * Report progress if enough time has passed or forced
   */
  private reportProgress(force: boolean = false): void {
    const now = Date.now()
    const timeSinceLastReport = now - this.lastReportTime
    
    if (!force && timeSinceLastReport < this.reportInterval) {
      return
    }
    
    if (this.callback) {
      const progress = this.getProgress()
      this.callback(progress)
    }
    
    this.lastReportTime = now
  }
  
  /**
   * Get current progress information
   */
  getProgress(): ParseProgress {
    const now = Date.now()
    const elapsedTime = now - this.startTime
    const processedTotal = this.processedNodes + this.skippedNodes
    
    // Estimate time remaining
    let estimatedTimeRemaining: number | undefined
    if (processedTotal > 0 && this.totalNodes > 0) {
      const rate = processedTotal / elapsedTime // nodes per ms
      const remaining = this.totalNodes - processedTotal
      estimatedTimeRemaining = remaining / rate
    }
    
    return {
      totalNodes: this.totalNodes,
      processedNodes: this.processedNodes,
      skippedNodes: this.skippedNodes,
      currentNode: this.currentNode,
      memoryUsage: getMemoryUsage(),
      elapsedTime,
      estimatedTimeRemaining
    }
  }
  
  /**
   * Get completion percentage
   */
  getCompletionPercentage(): number {
    if (this.totalNodes === 0) return 0
    const processed = this.processedNodes + this.skippedNodes
    return Math.round((processed / this.totalNodes) * 100 * 100) / 100
  }
  
  /**
   * Check if parsing is complete
   */
  isComplete(): boolean {
    const processed = this.processedNodes + this.skippedNodes
    return this.totalNodes > 0 && processed >= this.totalNodes
  }
  
  /**
   * Force final progress report
   */
  complete(): void {
    this.reportProgress(true)
  }
}

/**
 * Format progress information for display
 */
export function formatProgress(progress: ParseProgress): string {
  const percentage = progress.totalNodes > 0 
    ? Math.round(((progress.processedNodes + progress.skippedNodes) / progress.totalNodes) * 100)
    : 0
  
  const elapsedSeconds = Math.round((progress.elapsedTime || 0) / 1000)
  const remainingSeconds = progress.estimatedTimeRemaining 
    ? Math.round(progress.estimatedTimeRemaining / 1000)
    : null
  
  let timeInfo = `${elapsedSeconds}s elapsed`
  if (remainingSeconds !== null) {
    timeInfo += `, ~${remainingSeconds}s remaining`
  }
  
  return `Progress: ${percentage}% (${progress.processedNodes} processed, ${progress.skippedNodes} skipped) | Memory: ${progress.memoryUsage}MB | ${timeInfo}`
}

/**
 * Create a simple console progress reporter
 */
export function createConsoleReporter(): ProgressCallback {
  return (progress: ParseProgress) => {
    const formatted = formatProgress(progress)
    console.log(`[Parser] ${formatted}`)
  }
}