import type { FormModule } from '../../core/module.js';
import { messages } from './messages.js';
import { model } from './model.js';
import { routes } from './routes.js';
import { input } from './schema.js';

export const ordemServico: FormModule = {
  id: 'ordem-servico',
  version: 1,
  resource: 'ordens-servico',
  input,
  model,
  messages,
  routes,
};
