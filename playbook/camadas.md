# Camadas de um formulário

Um formulário é uma spec em `specs/<id>.json` e um módulo em `src/forms/<id>/`.
A referência é `inspecao-equipamento`, escrita à mão. Todo módulo novo segue a
mesma forma, arquivo por arquivo.

| # | Arquivo | O que contém | Quem confere |
|---|---------|--------------|--------------|
| 1 | `schema.ts` | `input = withRules(z.strictObject({...}), (value, ctx) => {...})`: um campo por campo da spec, na ordem das seções, e as regras | verificador (estrutura) + testes (regras) |
| 2 | `types.ts` | `<Nome>Input` (`z.infer`), `<Nome>Computed` (campos calculados) e `<Nome>` (registro salvo) | `tsc` |
| 3 | `model.ts` | `defineModel`: tabela `snake_case(id)`, uma coluna `snake_case(campo)` por campo e por calculado | verificador |
| 4 | `messages.ts` | `fields`: uma mensagem pt-BR por campo de entrada; `rules`: uma por regra | verificador |
| 5 | `service.ts` | `compute(input)` (regras de cálculo, função pura) e `createService(repository)` com `create`, `get` e `list` | testes + verificador (ida e volta) |
| 6 | `routes.ts` | `POST /`, `GET /` e `GET /:id`, usando `parseInput` e `readBody` do core | verificador |
| 7 | `index.ts` | o `FormModule`: `id`, `version`, `resource`, `input`, `model`, `messages`, `routes` | verificador |
| 8 | `src/forms/registry.ts` | o módulo adicionado à lista `forms` | verificador |
| 9 | `test/forms/<id>.test.ts` | pelo menos um teste por regra, com o id da regra no nome: `it('R2: ...')` | verificador + `vitest` |

## Convenções

- **Tipos de campo → Zod:**

  | Tipo na spec | Zod |
  |--------------|-----|
  | `text` | `z.string().trim().min(minLength).max(maxLength)` |
  | `integer` | `z.int()` |
  | `decimal` | `z.number()` |
  | `boolean` | `z.boolean()` |
  | `date` | `z.iso.date()` |
  | `enum` | `z.enum([...])`, na ordem da spec |
  | `photos` | `z.array(z.string().trim().min(1)).min(minItems).max(maxItems)` |

  `minLength` e `minItems` valem 1 quando a spec não diz nada. O `trim()` vem
  antes do mínimo.
- **Opcional é ausente, nunca `null` nem vazio:** um campo não obrigatório usa
  só `.optional()`. Texto em branco e lista vazia são recusados, mesmo em
  campo opcional. A mensagem desses campos diz "... ou omita o campo", a não
  ser que uma regra possa exigi-lo: aí ela só dá o formato, porque omitir
  também seria um erro.
- **Tipos de campo → coluna:** `text` e `enum` → `text`, `integer` →
  `integer`, `decimal` → `numeric`, `boolean` → `boolean`, `date` → `date`,
  `photos` → `text[]`. Coluna de campo opcional é `nullable: true`; a de um
  campo obrigatório ou calculado, `nullable: false`.
- **Regras de validação** ficam no segundo argumento de `withRules`, que só as
  roda sobre entrada estruturalmente válida, e levantam o erro com
  `ruleIssue(ctx, 'R<n>', messages, '<campo>')`. O campo é o que o usuário
  precisa corrigir; uma regra pode apontar mais de um campo.
- **Texto obrigatório por regra:** a regra só vê texto já aparado e não vazio,
  então basta testar a presença do campo. Um texto em branco é erro de
  estrutura, com a mensagem do campo.
- **Regras de cálculo** ficam em `compute`, uma função pura exportada, testada
  sem HTTP. Valores monetários calculados são arredondados a 2 casas, meio
  centavo para cima.
- **Mensagens** em pt-BR, no imperativo, com os limites da spec ("até 20
  caracteres", "de 1 a 5").
- **Testes de regra** cobrem o caso que viola a regra e o caso que a satisfaz,
  inclusive o limite (nota 3 libera; nota 2 não).

## O que um módulo nunca faz

- Alterar a spec, o core (`src/core`), o verificador (`src/checker`) ou outro
  formulário.
- Aceitar campo calculado como entrada.
- Enfraquecer um teste para o verificador passar.
