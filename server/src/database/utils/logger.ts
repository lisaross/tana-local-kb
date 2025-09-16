/**
 * Simple database logging utility
 * 
 * Provides structured logging for database operations with different log levels.
 * In production, logs can be configured to use proper logging frameworks.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class DatabaseLogger {
  private enabled = true
  private logLevel: LogLevel = 'info'

  constructor() {
    // Set log level from environment
    const envLevel = process.env.DATABASE_LOG_LEVEL as LogLevel
    if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
      this.logLevel = envLevel
    }
    
    // Disable in test environment unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_ENABLE_LOGS) {
      this.enabled = false
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false
    
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    return levels[level] >= levels[this.logLevel]
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [DB:${level.toUpperCase()}]`
    
    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${message} ${JSON.stringify(context)}`
    }
    
    return `${prefix} ${message}`
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, context))
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context))
    }
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext = error instanceof Error 
        ? { ...context, error: error.message, stack: error.stack }
        : { ...context, error }
      console.error(this.formatMessage('error', message, errorContext))
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }
}

// Export singleton instance
export const dbLogger = new DatabaseLogger()

// Export convenience functions
export const logInfo = dbLogger.info.bind(dbLogger)
export const logWarn = dbLogger.warn.bind(dbLogger)
export const logError = dbLogger.error.bind(dbLogger)
export const logDebug = dbLogger.debug.bind(dbLogger)