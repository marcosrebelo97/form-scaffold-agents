# Decisões de projeto

Cada decisão com o porquê, inclusive o que foi decidido **não** fazer.

## 1. A spec é a fonte da verdade, em duas metades

A spec tem uma metade **estrutural** (seções, campos, tipos, limites, campos
calculados) e uma metade **em linguagem natural** (as regras de negócio). A
estrutural é verificável por máquina. A outra é o motivo de existir um agente.

**Por quê:** é o formato em que as pessoas de negócio já descrevem um
formulário ("se houver falha, foto é obrigatória"). Forçar as regras numa DSL
trocaria um texto que qualquer um revisa por uma linguagem que só o time
entende, e ainda assim não cobriria toda regra que aparece.

## 2. Por que um agente, e não um gerador de templates

Para a parte estrutural, um gerador de templates resolveria. A prova está no
próprio repositório: `referenceSchema(spec)` deriva o schema estrutural em 40
linhas. Se os seus formulários são só estrutura, use um gerador.

O agente se paga no resto:
- **as regras**, que viram código e testes de limite;
- **os cálculos**;
- **as mensagens** coerentes com os limites;
- **a aderência às convenções do código existente**, que muda com o tempo e
  que um template precisaria acompanhar à mão.

No projeto de saúde em que o padrão nasceu, com fichas clínicas de prontuário
eletrônico, esse "resto" era onde o tempo ia. É a parte que caiu de mais de um
dia para cerca de uma hora por ficha.

**O que fica de fora do LLM:** decidir se o módulo está certo. Isso é do
verificador (decisão 3) e dos testes.

## 3. O verificador lê valores de runtime, não código-fonte

O verificador importa o módulo e compara com a spec:
- o JSON Schema do `input` (`z.toJSONSchema`, API pública do Zod 4);
- o objeto `model`, o objeto `messages` e a tabela de rotas do Hono.

Ele não interpreta TypeScript.

**Por quê:** analisar código-fonte é frágil (formatação, imports, helpers) e
não prova nada sobre o que roda. O valor de runtime é o que a API realmente
usa. O custo é exigir que cada camada exporte um valor inspecionável, o que é
o contrato `FormModule`.

**Limite conhecido:** as rotas importam o schema direto de `schema.ts`. Um
módulo que validasse com outro schema dentro de `routes.ts` passaria na
comparação estrutural. O teste de comportamento (decisão 4) pega a maior parte
desse desvio, porque exige as mensagens do campo e a recusa de campos
desconhecidos. A revisão do `form-validator` pega o resto.

## 4. Exemplo obrigatório na spec, exercitado de ponta a ponta

Toda spec traz um `example` válido. O verificador:
1. faz o POST do exemplo;
2. exige `201` e todos os campos de volta, intactos;
3. confere o tipo dos campos calculados;
4. confere o mesmo registro em `GET /:id` e em `GET /`.

Depois faz um POST vazio e exige `422`, com a mensagem de cada campo
obrigatório. Por fim, envia um campo desconhecido e exige a recusa.

**Por quê:** a comparação estrutural prova que as camadas concordam com a
spec. A ida e volta prova que elas estão **ligadas** entre si: schema → service
→ modelo → repositório → resposta. Uma coluna mapeada para o campo errado, um
calculado esquecido ou um `toRow` que perde dado só aparecem assim.

O exemplo também é validado contra a estrutura da spec ao carregá-la, então um
exemplo inválido é erro da spec, não do módulo.

## 5. O teste de comportamento só roda sobre um módulo estruturalmente são

**Por quê:** com a estrutura quebrada, o comportamento falha em cascata e
repete o mesmo problema em cinco mensagens. Um achado por causa raiz é o que
permite ao agente corrigir em poucas iterações.

## 6. O verificador não julga as regras, mas exige um teste por regra

Cada regra precisa de um teste com o id no nome (`it('R2: ...')`). Se a regra
está certa, quem diz são esses testes, e a revisão diz se eles provam alguma
coisa.

**Por quê:** julgar a fidelidade de "cobertura em garantia não aceita custo de
peças nem de mão de obra" exige ler texto e código juntos. Isso é raciocínio, e é trabalho do
`form-validator`. O determinístico garante o que é garantível: nenhuma regra
fica sem teste.

## 7. Dois agentes: quem gera não revisa

O `form-scaffolder` escreve. O `form-validator` só tem `Read`, `Glob`, `Grep`
e `Bash`, sem ferramenta de escrita, e procura o que o verificador não vê:
- condição invertida;
- limite trocado;
- teste que passaria com a regra removida;
- mensagem incoerente;
- arquivo fora do escopo.

**Por quê:** o mesmo contexto que escreveu o código tende a confirmar a
própria leitura da regra. Um revisor com contexto limpo e sem como "consertar"
precisa apontar o problema, e o achado fica registrado.

## 8. O gerador não alcança o gate, e quem confere é o `git status`

Uma geração só pode alterar três coisas: a pasta do módulo, o teste dele e o
registro. O `/novo-formulario`:
1. exige a spec commitada e a árvore limpa;
2. anota o commit de partida (a base);
3. depois da geração, faz `npm ci`, **antes** de qualquer check: os checks
   rodam sobre `node_modules/` (inclusive o `git` que o `npm run` acha
   primeiro no `PATH`, em `node_modules/.bin`);
4. roda `npm run check:scope -- <id> --base <base>`;
5. só então roda o gate.

O `check:scope` reprova qualquer caminho fora do escopo que difira da base:
- **commitado depois ou não:** compara com a base, não com `HEAD`, então um
  `git commit` do gerador não esconde nada;
- **novo;**
- **escondido** por um padrão de ignore ou marcado com `skip-worktree` ou
  `assume-unchanged`, que o `git diff` deixaria de comparar. Isso só vale em
  caminhos do gate (`src/`, `test/`, `specs/`, `playbook/`, `.claude/agents`,
  `.claude/commands`, `.github/` e os arquivos de config da raiz). Um `.env`,
  `.idea/` ou `.claude/settings.local.json` ignorado na máquina do dev não
  reprova a geração.

A base precisa ser um commit existente: `--base` sem valor, ou com algo que
o git leria como opção, é erro, não `HEAD`.

Renames contam como dois caminhos. O `node_modules/` não é inspecionado: o
`npm ci` o recria a partir do lockfile, que está no escopo protegido.

**Por quê:** um agente que pode editar o verificador, o `package.json` (que
define o `check`), o schema de referência ou o CI consegue fazer o gate
passar. É o mesmo princípio do orquestrador: quem produz não decide.

**Por que não um `deny` em `.claude/settings.json`:** foi a primeira versão, e
a revisão de código derrubou. Três motivos:
- a lista sempre esquece um caminho (ficaram de fora `src/spec` e o
  `package.json`);
- não cobre escrita via shell;
- vale para **toda** sessão no projeto, inclusive a humana que precisa
  corrigir o verificador.

Conferir o resultado no disco cobre todos os caminhos e todas as ferramentas,
e só se aplica onde a geração acontece.

**Limite conhecido:** o `check:scope` vale para o fluxo local. Num PR, o que
protege o gate é a revisão do diff. Um `CODEOWNERS` sobre `src/`, `specs/`,
`package.json` e `.github/` deixaria isso explícito num time.

## 9. Opcional é ausente; entrada estrita; calculado não é entrada; regra só sobre estrutura válida

- Campo opcional não aceita `null`, texto em branco (`"   "`) nem lista vazia.
  O texto passa por `trim()` antes do mínimo, e `minLength` e `minItems` valem
  1 por padrão. Isso vale também para cada referência de foto. Como o JSON
  Schema não mostra um `trim()`, o verificador confere isso enviando um valor
  em branco a cada campo. Ele exige um erro **de estrutura**: uma regra que
  por acaso recuse o branco no exemplo não conta, porque noutro contexto o
  branco seria gravado.
- As regras de negócio entram por `withRules`, que só as roda quando a
  estrutura é válida. Sem isso, o Zod roda as regras mesmo depois de um
  limite quebrado, e o erro da regra encobre o que há de errado com o valor,
  tanto para o cliente quanto para o verificador.

  Uma versão anterior tentou resolver no `parseInput`, dando prioridade ao
  erro da regra. A revisão de código mostrou que isso escondia o erro
  estrutural e deixava o teste de branco passar num módulo sem `trim()`.
- O schema é `z.strictObject`.
- Um campo calculado enviado no corpo é recusado.

**Por quê:** `null` e ausente com o mesmo significado duplicam todos os
casos de teste e de regra. Campo desconhecido aceito em silêncio esconde erro
de integração. Calculado aceito como entrada deixaria o cliente decidir o
custo total de uma ordem de serviço.

## 10. Repositório em memória que se comporta como banco

O `MemoryRepository` recusa coluna desconhecida e `null` em coluna `NOT NULL`,
e devolve cópias.

**Por quê:** sem isso, um `model` com nulabilidade errada passaria em todos os
testes e só quebraria contra um banco real. Trocar por Postgres é implementar
`Repository`. A DDL pode ser derivada do mesmo `model`.

## 11. Hono

As rotas são testadas com `app.request()`, sem abrir porta, e a tabela de rotas
(`app.routes`) é inspecionável, o que o verificador usa.

**Alternativa descartada:** Express precisaria de `supertest` para o mesmo
teste e não expõe as rotas de forma estável.

## 12. Achado de revisão vira regra determinística

Quando uma revisão acha um problema que o verificador deixou passar, a
correção vai para o gate, não só para o módulo, e nasce com um teste de
mutação que a quebra.

**Exemplo:** o `form-validator` notou que um código de equipamento aceitava `""`.
Corrigir o módulo resolveria o caso. A regra no gate (decisão 9) resolve a
classe: nenhum texto ou lista em branco passa, em nenhum formulário.

**Por quê:** a cada revisão, o que dependia de alguém notar passa a ser
garantido por código. O teste de mutação prova que a regra cobre a classe
inteira; a primeira tentativa deste exemplo não cobria.

Quando o achado não é verificável por código, ele vira convenção do playbook
ou instrução do agente, e passa a valer para o próximo formulário. Exemplo:
no `ordem-servico`, a revisão notou que a mensagem de um campo exigido por
regra dizia "ou omita o campo", e que o agente anotou uma decisão "a
confirmar" mas entregou `PRONTO`. As duas coisas viraram texto no playbook e
no `form-scaffolder`.

## O que foi decidido não fazer

- **Versionamento de formulário e migrações.** `version` existe na spec e no
  módulo, mas não há migração entre versões. Num sistema real, mudar uma spec
  em produção é o problema mais difícil e merece um projeto próprio.
- **Renderização da spec em UI.** A mesma spec poderia gerar o formulário do
  app de inspeção. Fica fora para manter o foco no backend gerado.
- **Upload de fotos.** O formulário guarda referências; o upload é de outro
  serviço.
- **Autenticação e autorização.**
