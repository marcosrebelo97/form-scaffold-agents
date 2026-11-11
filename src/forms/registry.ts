import type { FormModule } from '../core/module.js';
import { inspecaoEquipamento } from './inspecao-equipamento/index.js';

/** Every form the API serves. A module that is not listed here does not exist for the checker. */
export const forms: readonly FormModule[] = [inspecaoEquipamento];
