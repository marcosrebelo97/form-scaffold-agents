import { Hono } from 'hono';
import type { FormModule } from './module.js';
import type { Repository } from './repository.js';

export function createApp(modules: readonly FormModule[], repository: Repository): Hono {
  const app = new Hono();

  app.get('/forms', (c) => c.json(modules.map(({ id, version, resource }) => ({ id, version, resource }))));
  for (const module of modules) app.route(`/${module.resource}`, module.routes(repository));

  app.notFound((c) => c.json({ error: 'Recurso não encontrado.' }, 404));
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Erro interno.' }, 500);
  });
  return app;
}
