import type { Hono } from 'hono';
import type { z } from 'zod';
import type { Model } from './model.js';
import type { Repository } from './repository.js';
import type { Messages } from './validation.js';

/**
 * What every form module exports from its `index.ts`. The checker reads these values at runtime
 * and compares each one with the spec.
 */
export interface FormModule {
  id: string;
  version: number;
  resource: string;
  /** Input schema: structure from the spec, plus the business rules. */
  input: z.ZodObject;
  model: Model;
  messages: Messages;
  /** Mounted at `/<resource>`: POST /, GET /, GET /:id. */
  routes(repository: Repository): Hono;
}
