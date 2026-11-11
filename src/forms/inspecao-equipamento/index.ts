import type { FormModule } from '../../core/module.js';
import { messages } from './messages.js';
import { model } from './model.js';
import { routes } from './routes.js';
import { input } from './schema.js';

export const inspecaoEquipamento: FormModule = {
  id: 'inspecao-equipamento',
  version: 1,
  resource: 'inspecoes-equipamento',
  input,
  model,
  messages,
  routes,
};
