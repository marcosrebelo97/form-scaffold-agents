import { Hono } from 'hono';
import type { Repository } from '../../core/repository.js';
import { parseInput, readBody } from '../../core/validation.js';
import { messages } from './messages.js';
import { input } from './schema.js';
import { createService } from './service.js';

export function routes(repository: Repository): Hono {
  const service = createService(repository);
  const app = new Hono();

  app.post('/', async (c) => {
    const parsed = parseInput(input, await readBody(c), messages);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 422);
    return c.json(await service.create(parsed.data), 201);
  });

  app.get('/', async (c) => c.json(await service.list()));

  app.get('/:id', async (c) => {
    const ordem = await service.get(c.req.param('id'));
    return ordem ? c.json(ordem) : c.json({ error: 'Ordem de serviço não encontrada.' }, 404);
  });

  return app;
}
