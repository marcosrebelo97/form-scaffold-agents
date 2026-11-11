import type { z } from 'zod';
import type { input } from './schema.js';

export type OrdemServicoInput = z.infer<typeof input>;

export interface OrdemServicoComputed {
  /** R4 */
  custoTotal: number;
}

export type OrdemServico = OrdemServicoInput & OrdemServicoComputed & { id: string; createdAt: string };
