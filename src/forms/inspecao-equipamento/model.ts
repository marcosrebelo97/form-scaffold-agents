import { defineModel } from '../../core/model.js';

export const model = defineModel({
  table: 'inspecao_equipamento',
  columns: {
    codigo_equipamento: { field: 'codigoEquipamento', type: 'text', nullable: false },
    local_instalacao: { field: 'localInstalacao', type: 'text', nullable: false },
    data_inspecao: { field: 'dataInspecao', type: 'date', nullable: false },
    responsavel: { field: 'responsavel', type: 'text', nullable: false },
    lubrificacao_realizada: { field: 'lubrificacaoRealizada', type: 'boolean', nullable: false },
    nota_conservacao: { field: 'notaConservacao', type: 'integer', nullable: false },
    observacoes_conservacao: { field: 'observacoesConservacao', type: 'text', nullable: true },
    itens_seguranca_ok: { field: 'itensSegurancaOk', type: 'boolean', nullable: false },
    itens_seguranca_pendentes: { field: 'itensSegurancaPendentes', type: 'text', nullable: true },
    manual_disponivel: { field: 'manualDisponivel', type: 'boolean', nullable: false },
    possui_falhas: { field: 'possuiFalhas', type: 'boolean', nullable: false },
    descricao_falhas: { field: 'descricaoFalhas', type: 'text', nullable: true },
    fotos_falhas: { field: 'fotosFalhas', type: 'text[]', nullable: true },
    situacao: { field: 'situacao', type: 'text', nullable: false },
    // computed
    pendencias: { field: 'pendencias', type: 'integer', nullable: false },
  },
});
