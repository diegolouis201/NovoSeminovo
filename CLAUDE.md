# NovoSeminovo — regras para quem desenvolve (pessoas e IA)

Leia `HANDOFF.md` antes de começar: é o mapa do que existe. O agente
`.claude/agents/novoseminovo-dev.md` tem o fluxo de teste e as convenções.

## TDD é obrigatório (decisão do Diego, 01/11/2026)

Toda funcionalidade nova ou correção segue, nesta ordem:

1. **Teste primeiro.** Escreva o teste que descreve o comportamento pedido
   (API: `apps/api/src/**/*.spec.ts` com `node:test`; tela/fluxo:
   `apps/web/cypress/e2e/*.cy.ts`).
2. **Veja falhar.** Rode e confirme que falha pelo motivo certo.
3. **Código mínimo** para passar.
4. **Refatore** com os testes verdes.
5. Antes de commitar: `pnpm --filter @novoseminovo/api test`,
   `pnpm exec tsc --noEmit` em `apps/api` e `apps/web`, e a suíte Cypress
   (`pnpm --filter @novoseminovo/web e2e`) quando a mudança mexe em tela.

Bug encontrado = primeiro um teste que reproduz o bug, depois a correção.

## Segurança: todo dado que entra é suspeito

Vale para formulário, URL, cabeçalho, upload, feed de CRM, página importada
de outro site, resposta de API externa e texto que a IA gera.

- **Validação**: toda rota valida o corpo e a query com zod
  (`parseOrBadRequest`) com tamanho máximo em texto livre. Nada de
  `@Body() body` usado sem passar pelo schema.
- **SQL injection**: só Prisma. Proibido `$queryRawUnsafe`/`$executeRawUnsafe`
  e SQL montado com texto; consulta crua só como template marcado
  (`$queryRaw\`...\``). Nome de campo/ordenação vindo do usuário passa por
  lista fixa (allowlist).
- **Script injection (XSS)**: nada de `dangerouslySetInnerHTML` com dado de
  usuário; HTML montado na API (e-mails, páginas) escapa todo valor; link
  vindo de usuário só com `http(s)://` (nunca `javascript:`); `target="_blank"`
  sempre com `rel="noopener noreferrer"`; CSV exportado neutraliza fórmulas
  (`=`, `+`, `-`, `@`).
- **Prompt injection**: texto de usuário ou de terceiros que vai para a IA
  entra marcado como dado (ver `untrusted()` em `apps/api/src/operations`),
  nunca como instrução. Resposta da IA não executa ação perigosa sozinha:
  ação que muda dado de outra pessoa ou gasta dinheiro pede confirmação;
  ids que a IA escreve são conferidos contra a lista real.
- **CORS / mesma origem**: o navegador só fala com a API a partir do site
  (`apps/api/src/common/cors.ts`, comparação exata com `WEB_ORIGIN`). Não
  abrir para `*` nem para outros domínios. Arquivos de `/uploads` saem com
  `Cross-Origin-Resource-Policy: same-site`.
- **Segredos**: chave nunca no código, no `.env` versionado nem no GitHub;
  em produção só em arquivo (`readSecret`/`currentSecret`, pasta `secrets/`).
  Senha só com `hashPassword`/`verifyPassword` (bcrypt 12). Dado pessoal
  novo (CPF, telefone, documento, conta bancária) entra em `ENCRYPTED_FIELDS`
  (`apps/api/src/common/field-encryption.ts`) com coluna `*Hash` se precisar
  de busca; nunca acessar o banco sem o `PrismaService`.
- **Imagens e arquivos enviados**: todo upload passa por `sanitizeUpload`
  (ou `assertNoMalware` para PDF); todo `sharp` é `safeSharp`. Tipo do
  arquivo é decidido pelos bytes, nunca pela extensão/cabeçalho.
- Cada regra acima tem teste. Mudou algo nessas áreas, o teste correspondente
  precisa continuar passando (ou ganhar um caso novo).
