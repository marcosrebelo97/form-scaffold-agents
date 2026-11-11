import { z } from 'zod';
import { ruleIssue, withRules } from '../../core/validation.js';
import { messages } from './messages.js';

export const input = withRules(
  z.strictObject({
    // identificacao
    codigoEquipamento: z.string().trim().min(1).max(20),
    localInstalacao: z.string().trim().min(1).max(40),
    dataInspecao: z.iso.date(),
    responsavel: z.string().trim().min(3).max(80),
    // conservacao
    lubrificacaoRealizada: z.boolean(),
    notaConservacao: z.int().min(1).max(5),
    observacoesConservacao: z.string().trim().min(1).max(500).optional(),
    // seguranca
    itensSegurancaOk: z.boolean(),
    itensSegurancaPendentes: z.string().trim().min(1).max(500).optional(),
    manualDisponivel: z.boolean(),
    // falhas
    possuiFalhas: z.boolean(),
    descricaoFalhas: z.string().trim().min(1).max(1000).optional(),
    fotosFalhas: z.array(z.string().trim().min(1)).min(1).max(10).optional(),
    // resultado
    situacao: z.enum(['liberado', 'liberado-com-restricoes', 'bloqueado']),
  }),
  (value, ctx) => {
    if (value.possuiFalhas) {
      if (!value.descricaoFalhas) ruleIssue(ctx, 'R1', messages, 'descricaoFalhas');
      if (!value.fotosFalhas?.length) ruleIssue(ctx, 'R1', messages, 'fotosFalhas');
    }
    if (!value.itensSegurancaOk && !value.itensSegurancaPendentes) ruleIssue(ctx, 'R2', messages, 'itensSegurancaPendentes');
    if (value.situacao === 'liberado' && (!value.lubrificacaoRealizada || value.notaConservacao < 3)) {
      ruleIssue(ctx, 'R3', messages, 'situacao');
    }
  },
);
