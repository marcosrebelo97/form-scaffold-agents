import { z } from 'zod';
import { ruleIssue, withRules } from '../../core/validation.js';
import { messages } from './messages.js';

export const input = withRules(
  z.strictObject({
    // identificacao
    codigoEquipamento: z.string().trim().min(1).max(20),
    numeroOrdem: z.string().trim().min(1).max(40),
    dataEncerramento: z.iso.date(),
    tecnico: z.string().trim().min(3).max(80),
    // prazo
    concluidaNoPrazo: z.boolean(),
    diasAtraso: z.int().min(1).max(60).optional(),
    equipamentoLiberado: z.boolean(),
    motivoNaoLiberacao: z.string().trim().min(1).max(500).optional(),
    // pecas
    houveTrocaPecas: z.boolean(),
    descricaoPecas: z.string().trim().min(1).max(1000).optional(),
    fotosPecas: z.array(z.string().trim().min(1)).min(1).max(10).optional(),
    custoPecas: z.number().min(0).max(500000).optional(),
    horasTrabalhadas: z.number().min(0.5).max(500),
    valorHora: z.number().min(0).max(1000).optional(),
    // cobertura
    cobertura: z.enum(['garantia', 'contrato', 'avulsa']),
  }),
  (value, ctx) => {
    if (!value.concluidaNoPrazo && value.diasAtraso === undefined) ruleIssue(ctx, 'R1', messages, 'diasAtraso');
    if (value.concluidaNoPrazo && value.diasAtraso !== undefined) ruleIssue(ctx, 'R1', messages, 'diasAtraso');
    if (value.houveTrocaPecas) {
      if (value.descricaoPecas === undefined) ruleIssue(ctx, 'R2', messages, 'descricaoPecas');
      if (value.fotosPecas === undefined) ruleIssue(ctx, 'R2', messages, 'fotosPecas');
    } else {
      for (const field of ['descricaoPecas', 'fotosPecas', 'custoPecas'] as const) {
        if (value[field] !== undefined) ruleIssue(ctx, 'R2', messages, field);
      }
    }
    if (value.cobertura === 'garantia') {
      // Without a replacement, R2 already rejects the parts cost: one error per field.
      if (value.houveTrocaPecas && value.custoPecas !== undefined) ruleIssue(ctx, 'R3', messages, 'custoPecas');
      if (value.valorHora !== undefined) ruleIssue(ctx, 'R3', messages, 'valorHora');
    }
    if (value.cobertura === 'avulsa' && value.valorHora === undefined) ruleIssue(ctx, 'R3', messages, 'valorHora');
    if (!value.equipamentoLiberado && !value.motivoNaoLiberacao) ruleIssue(ctx, 'R5', messages, 'motivoNaoLiberacao');
    if (value.equipamentoLiberado && value.motivoNaoLiberacao !== undefined) {
      ruleIssue(ctx, 'R5', messages, 'motivoNaoLiberacao');
    }
  },
);
