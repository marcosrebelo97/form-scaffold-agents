---
description: Gera, verifica e revisa o módulo de um formulário a partir de specs/<id>.json
argument-hint: <id-do-formulario>
---

Gere o módulo do formulário `$ARGUMENTS`.

1. Confirme três coisas:
   - `specs/$ARGUMENTS.json` existe **e está commitada**: a spec é revisada por
     um humano antes da geração;
   - `src/forms/$ARGUMENTS/` ainda não existe;
   - `git status --porcelain` está vazio.

   Sem a árvore limpa, a verificação de escopo não tem como separar o que o
   gerador mudou. Se alguma das três falhar, pare e explique. Anote a saída de
   `git rev-parse HEAD`: é a **base** da geração.
2. Delegue a geração ao subagente **form-scaffolder** com o id
   `$ARGUMENTS` e a base. Se o status for `BLOQUEADO`, mostre as perguntas e
   pare: a spec precisa de uma resposta humana.
3. Rode você mesmo, nesta ordem:
   - `npm ci`, que reinstala as dependências a partir do lockfile e desfaz
     qualquer mudança em `node_modules/`, inclusive um `git` falso em
     `node_modules/.bin`. Vem **antes** dos checks, que rodam sobre ele;
   - `npm run check:scope -- $ARGUMENTS --base <base>`;
   - `npm run check`.

   Não confie no relato do gerador.
4. Delegue a revisão ao subagente **form-validator**, com a base.
5. Se o veredito for `REPROVADO`, devolva os achados ao **form-scaffolder** e
   repita os passos 3 e 4, no máximo duas vezes.
6. Termine com um resumo para a revisão humana:
   - o veredito e o resultado dos dois checks;
   - a tabela regra → código → teste;
   - as decisões que o gerador tomou;
   - o tempo total.

   Não faça commit.
