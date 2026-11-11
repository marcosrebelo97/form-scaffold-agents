import type { Messages } from '../../core/validation.js';

export const messages = {
  fields: {
    codigoEquipamento: 'Informe o código do equipamento (até 20 caracteres).',
    localInstalacao: 'Informe o local de instalação (até 40 caracteres).',
    dataInspecao: 'Informe a data da inspeção no formato AAAA-MM-DD.',
    responsavel: 'Informe o responsável pela inspeção (de 3 a 80 caracteres).',
    lubrificacaoRealizada: 'Informe se a lubrificação foi realizada.',
    notaConservacao: 'Informe a nota de conservação, um número inteiro de 1 a 5.',
    observacoesConservacao: 'Escreva as observações de conservação (até 500 caracteres) ou omita o campo.',
    itensSegurancaOk: 'Informe se proteções e sinalização estão em ordem.',
    itensSegurancaPendentes: 'Liste os itens de segurança pendentes (até 500 caracteres).',
    manualDisponivel: 'Informe se o manual de operação está disponível.',
    possuiFalhas: 'Informe se foram encontradas falhas.',
    descricaoFalhas: 'Descreva as falhas (até 1000 caracteres).',
    fotosFalhas: 'Envie de 1 a 10 referências de fotos das falhas.',
    situacao: 'Informe a situação: liberado, liberado-com-restricoes ou bloqueado.',
  },
  rules: {
    R1: 'Com falhas encontradas, descreva-as e envie pelo menos uma foto.',
    R2: 'Com itens de segurança fora de ordem, liste os pendentes.',
    R3: 'Sem lubrificação ou com nota de conservação abaixo de 3, o equipamento não pode ser liberado.',
    R4: 'Pendências calculadas a partir de falhas, segurança, manual e lubrificação.',
  },
} satisfies Messages;
