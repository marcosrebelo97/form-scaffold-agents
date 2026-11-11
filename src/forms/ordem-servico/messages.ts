import type { Messages } from '../../core/validation.js';

export const messages = {
  fields: {
    codigoEquipamento: 'Informe o código do equipamento (até 20 caracteres).',
    numeroOrdem: 'Informe o número da ordem de serviço (até 40 caracteres).',
    dataEncerramento: 'Informe a data de encerramento no formato AAAA-MM-DD.',
    tecnico: 'Informe o técnico responsável (de 3 a 80 caracteres).',
    concluidaNoPrazo: 'Informe se a ordem de serviço foi concluída no prazo.',
    diasAtraso: 'Informe os dias de atraso, um número inteiro de 1 a 60, ou omita o campo.',
    equipamentoLiberado: 'Informe se o equipamento foi liberado para operação.',
    motivoNaoLiberacao: 'Escreva o motivo da não liberação (até 500 caracteres) ou omita o campo.',
    houveTrocaPecas: 'Informe se houve troca de peças.',
    descricaoPecas: 'Descreva as peças trocadas (até 1000 caracteres) ou omita o campo.',
    fotosPecas: 'Envie de 1 a 10 referências de fotos das peças trocadas, ou omita o campo.',
    custoPecas: 'Informe o custo das peças em reais, de 0 a 500000, ou omita o campo.',
    horasTrabalhadas: 'Informe as horas trabalhadas, de 0,5 a 500.',
    valorHora: 'Informe o valor da hora técnica em reais, de 0 a 1000, ou omita o campo.',
    cobertura: 'Informe a cobertura do serviço: garantia, contrato ou avulsa.',
  },
  rules: {
    R1: 'Fora do prazo, informe os dias de atraso; no prazo, omita o campo.',
    R2: 'Com troca de peças, descreva-as e envie pelo menos uma foto; sem troca, omita o custo das peças.',
    R3: 'Na garantia, omita o custo das peças e o valor da hora; na cobertura avulsa, informe o valor da hora.',
    R4: 'Custo total calculado: custo das peças mais horas trabalhadas vezes o valor da hora.',
    R5: 'Com o equipamento não liberado, informe o motivo; com o equipamento liberado, omita o campo.',
  },
} satisfies Messages;
