import { serve } from '@hono/node-server';
import { createApp } from './core/app.js';
import { MemoryRepository } from './core/repository.js';
import { forms } from './forms/registry.js';

const port = Number(process.env.PORT ?? 3000);
// Local only by default: the API has no authentication. HOST=0.0.0.0 exposes it.
const hostname = process.env.HOST ?? '127.0.0.1';
const app = createApp(forms, new MemoryRepository());

serve({ fetch: app.fetch, port, hostname }, ({ port }) => {
  console.log(`API em http://${hostname}:${port} — formulários: ${forms.map((f) => f.resource).join(', ')}`);
});
