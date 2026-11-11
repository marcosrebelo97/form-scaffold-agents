import { defineModel } from '../../core/model.js';

export const model = defineModel({
  table: 'ordem_servico',
  columns: {
    codigo_equipamento: { field: 'codigoEquipamento', type: 'text', nullable: false },
    numero_ordem: { field: 'numeroOrdem', type: 'text', nullable: false },
    data_encerramento: { field: 'dataEncerramento', type: 'date', nullable: false },
    tecnico: { field: 'tecnico', type: 'text', nullable: false },
    concluida_no_prazo: { field: 'concluidaNoPrazo', type: 'boolean', nullable: false },
    dias_atraso: { field: 'diasAtraso', type: 'integer', nullable: true },
    equipamento_liberado: { field: 'equipamentoLiberado', type: 'boolean', nullable: false },
    motivo_nao_liberacao: { field: 'motivoNaoLiberacao', type: 'text', nullable: true },
    houve_troca_pecas: { field: 'houveTrocaPecas', type: 'boolean', nullable: false },
    descricao_pecas: { field: 'descricaoPecas', type: 'text', nullable: true },
    fotos_pecas: { field: 'fotosPecas', type: 'text[]', nullable: true },
    custo_pecas: { field: 'custoPecas', type: 'numeric', nullable: true },
    horas_trabalhadas: { field: 'horasTrabalhadas', type: 'numeric', nullable: false },
    valor_hora: { field: 'valorHora', type: 'numeric', nullable: true },
    cobertura: { field: 'cobertura', type: 'text', nullable: false },
    // computed
    custo_total: { field: 'custoTotal', type: 'numeric', nullable: false },
  },
});
