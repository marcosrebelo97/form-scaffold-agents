import type { z } from 'zod';
import type { input } from './schema.js';

export type InspecaoEquipamentoInput = z.infer<typeof input>;

export interface InspecaoEquipamentoComputed {
  /** R4 */
  pendencias: number;
}

export type InspecaoEquipamento = InspecaoEquipamentoInput & InspecaoEquipamentoComputed & { id: string; createdAt: string };
