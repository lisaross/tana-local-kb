import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors())

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'tana-local-kb',
    timestamp: new Date().toISOString()
  })
})

// Base route
app.get('/', (c) => {
  return c.json({ 
    message: 'Tana Local KB API',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      trpc: '/trpc/*'
    }
  })
})

// TODO: Add tRPC middleware here
// app.use('/trpc/*', trpcServer({ router: appRouter }))

const port = 3001
console.log(`🚀 Server starting on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}