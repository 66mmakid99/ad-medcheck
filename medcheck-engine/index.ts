/**
 * MedCheck Engine - Cloudflare Workers
 * ES Module Format
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  ENGINE_VERSION: string;
  PATTERN_VERSION: string;
  LOG_LEVEL: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'MedCheck Engine',
    version: c.env.ENGINE_VERSION || '1.0.0',
    status: 'running'
  });
});

app.get('/v1/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: c.env.ENGINE_VERSION
  });
});

// Patterns endpoint
app.get('/v1/patterns', (c) => {
  return c.json({
    message: 'Patterns endpoint',
    count: 156
  });
});

// Analyze endpoint
app.post('/v1/analyze', async (c) => {
  const body = await c.req.json();
  return c.json({
    message: 'Analysis endpoint',
    received: body
  });
});

// ES Module export (중요!)
export default app;
