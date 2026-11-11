# Contexto do projeto

API de formulários de manutenção industrial em que **cada formulário é uma spec
declarativa** (`specs/<id>.json`) e **um módulo em camadas**
(`src/forms/<id>/`). Os módulos novos são gerados por agentes do Claude Code
e só são aceitos quando um verificador determinístico confirma que todas as
camadas concordam com a spec.

## Invariantes (não podem regredir — qualquer mudança aqui exige teste)

1. **A spec é a fonte da verdade e pertence a um humano.** Agentes não editam
   `specs/`. Uma regra ambígua vira perguntas (`BLOQUEADO`), nunca uma
   interpretação silenciosa.
2. **O gate é determinístico.** `npm run check` (tsc + vitest +
   `check:forms`) decide se um módulo está consistente. O verificador lê
   valores de runtime (JSON Schema do `input`, `model`, `messages`, rotas) e
   exercita a API com o exemplo da spec. Nenhum LLM decide se passou.
3. **Quem gera não altera o gate.** Uma geração só pode tocar
   `src/forms/<id>/`, `test/forms/<id>.test.ts` e `src/forms/registry.ts`.
   `npm run check:scope -- <id> --base <commit>` reprova qualquer outro arquivo
   diferente do commit de onde a geração partiu: commitado ou não, novo,
   escondido por ignore ou por flag do índice. Antes dos dois checks, `npm ci`
   restaura `node_modules/`. Mudar a spec, o core, o verificador, os testes
   deles, o `package.json` ou o CI é uma mudança humana; no verificador, exige
   teste de mutação.
4. **Toda regra tem teste com o id no nome** (`it('R2: ...')`), cobrindo
   violação, satisfação e limite.
5. **Opcional é ausente, nunca `null` nem vazio.** Texto em branco e lista
   vazia são recusados, e campo calculado nunca é aceito como entrada.
6. **Revisão humana no fim.** Os agentes não fazem commit; o
   `form-validator` dá uma segunda opinião, mas o merge é humano.

## Comandos

```bash
npm run check                         # typecheck + testes + verificador
npm run check:forms -- <id>           # só o verificador, de um formulário
npm run check:scope -- <id> [--base <commit>]  # desde a base, só o módulo mudou
npm start                             # API em http://localhost:3000
```

No Claude Code: `/novo-formulario <id>` gera, verifica e revisa um módulo a
partir da spec.

## Convenções

- Código, identificadores e commits em inglês; specs, mensagens ao usuário e
  docs em pt-BR.
- As camadas e o mapeamento tipo → Zod → coluna estão em
  `playbook/camadas.md`; a referência é `src/forms/inspecao-equipamento/`.
- Sem dependências novas sem motivo escrito em `DECISIONS.md`.
