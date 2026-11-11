import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { FormModule } from './module.js';
import type { Repository } from './repository.js';

/** A form is text and photo references: 100 KB is far above any real one. */
export const MAX_BODY_BYTES = 100 * 1024;

export function createApp(modules: readonly FormModule[], repository: Repository): Hono {
  const app = new Hono();

  // Refuse an oversized body before it is read into memory.
  const tooLarge = { error: 'Corpo da requisição grande demais.' };
  app.use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json(tooLarge, 413) }));

  app.get('/forms', (c) => c.json(modules.map(({ id, version, resource }) => ({ id, version, resource }))));
  for (const module of modules) app.route(`/${module.resource}`, module.routes(repository));

  app.notFound((c) => c.json({ error: 'Recurso não encontrado.' }, 404));
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Erro interno.' }, 500);
  });
  return app;
}
