import { serve } from '@hono/node-server';
import { createApp } from './core/app.js';
import { MemoryRepository } from './core/repository.js';
import { forms } from './forms/registry.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp(forms, new MemoryRepository());

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`API em http://localhost:${port} — formulários: ${forms.map((f) => f.resource).join(', ')}`);
});
