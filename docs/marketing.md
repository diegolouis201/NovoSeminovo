# Marketing de ponta a ponta (`/admin/marketing`)

O agente de Marketing cria posts do Instagram, campanhas de e-mail e sequências automáticas como **rascunhos**. O dono vê a prévia e decide: aprovar, agendar, pedir alteração (o agente refaz) ou rejeitar. Nada é publicado ou enviado sem aprovação.

## Como funciona

| Peça | Onde | O que faz |
|---|---|---|
| Arte | `apps/api/src/marketing/art.service.ts` | Imagem 1080×1350 (4:5). Fundo: foto de um anúncio, imagem do Gemini (`GEMINI_API_KEY`) ou degradê da marca. Por cima vão o logo, o título e a linha de apoio na fonte Fredoka e o botão "novoseminovo.com.br". Se o fundo pedido falhar, usa o degradê e avisa. |
| Posts | `posts.service.ts` + `instagram.ts` | Aprovar grava o `contentHash` (legenda, hashtags e imagem). O trabalhador publica pela API oficial da Meta (contêiner → status → `media_publish` → permalink) e só publica se o conteúdo ainda for o aprovado. Busca as métricas a cada 6 h por 30 dias: alcance, curtidas, comentários, salvos e compartilhamentos. |
| Contatos | `contacts.service.ts` | Um contato por e-mail; o telefone também evita duplicar. Cada contato guarda a origem (utm/cookie `ns_origem`). A permissão só sobe. Quem se descadastra só volta se pedir de novo. |
| Captação | cadastro (`auth.service`), loja nova (`partners.service`), financiamento (`agents.service`), formulário do rodapé (`POST /marketing/subscribe`) | Permissões: **opt_in** (marcou a caixa no cadastro ou no rodapé), **legitimate_interest** (loja, imobiliária ou corretor cadastrado; pediu simulação de financiamento) e **none** (cadastro sem a caixa: fica registrado, mas não recebe marketing). |
| Campanhas | `email-marketing.service.ts` | Público por interesse, filtrado só para quem tem permissão e está ativo. Aprovar cria a fila de envios. Cada e-mail confere de novo a aprovação e a permissão antes de sair. O teto diário é `EMAIL_DAILY_LIMIT`; o que passa dele sai no dia seguinte. |
| Sequências | idem | Uma jornada por interesse (`comprador_carro`, `comprador_imovel`, `vendedor`, `loja`, `geral`). Contatos novos com permissão entram depois que ela é aprovada. Os passos têm intervalo em dias e uma condição (sempre, sem_conta, com_conta). A sequência para quando o contato se descadastra, o e-mail volta, marca como spam ou ele converte (publicou anúncio, pediu contato, virou loja). |
| Links | `links.ts` | Cliques passam por `/m/c/:envio/:assinatura` (HMAC). O redirecionamento vai só para o site e com utm de e-mail. O descadastro é `/m/u/:token`: o GET só mostra o botão, o POST descadastra, e o one-click do Gmail e do Outlook usa `List-Unsubscribe-Post`. |
| Webhook | `POST /webhooks/resend` | Assinatura Svix conferida com `RESEND_WEBHOOK_SECRET`. Registra entregue, voltou, spam e falhou. |
| Agente | `marketing-tools.service.ts`, prompt em `operations/agents.service.ts` | Ferramentas: `ler_resultados_marketing`, `listar_anuncios_para_post`, `criar_post_instagram`, `revisar_post_instagram`, `criar_campanha_email`, `revisar_campanha_email`, `propor_sequencia`. Todas são verdes porque só criam rascunhos. Limites: 3 posts por tarefa, 6 por dia e 2 campanhas por dia. "Pedir alteração" e "Transformar em post" (sugestões em `/admin/operacao`) viram tarefas na fila do agente. |
| Trabalhador | `marketing.service.ts` | Roda a cada minuto. Publica posts, busca métricas, prepara campanhas, inscreve contatos nas sequências, avança os passos e envia e-mails. Aparece como rotina "Marketing" na saúde das rotinas. É desligado por `OPERATIONS_DISABLED=1`. |

## O que precisa ser configurado (variáveis no `.env` da VPS)

1. **Instagram (publicação e métricas)**
   - Requisitos:
     - conta Instagram **profissional** ligada a uma Página do Facebook;
     - app da Meta com as permissões `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` e `pages_show_list`;
     - token de longa duração; o token de usuário do sistema do portfólio empresarial é o recomendado.
   - Variáveis: `INSTAGRAM_ACCESS_TOKEN` e `INSTAGRAM_ACCOUNT_ID` (o id da conta profissional, não o @).
   - Login pelo Instagram em vez do Facebook: `INSTAGRAM_GRAPH_HOST=graph.instagram.com`.
   - Sem essas variáveis, o post aprovado fica esperando e a tela avisa.
2. **Webhook do Resend**
   - No painel do Resend, em Webhooks, adicione `https://api.novoseminovo.com.br/webhooks/resend` com os eventos `email.sent`, `email.delivered`, `email.bounced`, `email.complained` e `email.failed`.
   - Copie o "Signing secret" (`whsec_…`) para `RESEND_WEBHOOK_SECRET`.
3. **Limite diário**
   - O plano grátis do Resend permite 100 e-mails por dia (3.000 por mês), contando os avisos do site; o padrão aqui é 80.
   - No plano pago, aumente `EMAIL_DAILY_LIMIT`.
4. **Opcionais**
   - `GEMINI_API_KEY` para imagens geradas por IA (é a mesma chave do Arquiteto).
   - `EMAIL_REPLY_TO` para onde vão as respostas (padrão: diego.louis@).
   - `MARKETING_LINK_SECRET` para assinar os links; sem ela, usa o `JWT_SECRET`.

## Limites conhecidos

- **Respostas** a e-mails chegam na caixa do `EMAIL_REPLY_TO` e não são contadas na tela.
- **Aberturas** não são medidas: os leitores de e-mail bloqueiam o pixel, então o número não seria confiável.
- **Contatos antigos não entram em sequência**: só os que chegarem depois da aprovação dela. Para a base antiga, use uma campanha.
- **Revisão jurídica**: o texto de consentimento e a base "interesse legítimo" para lojas e financiamento devem passar pela revisão de um advogado (LGPD).

## Testes

`pnpm --filter @novoseminovo/api test` executa `src/marketing/marketing.spec.ts` com servidores falsos da Meta e do Resend. O teste cobre:

- contatos sem duplicar;
- post aprovado e publicado, com as métricas;
- conteúdo alterado depois da aprovação, que não é publicado;
- pedido de alteração, que gera tarefa para o agente;
- campanha que vai só para quem tem permissão, com clique e entrega;
- sequência com condição, que para quando o e-mail volta;
- assinatura do webhook;
- permissões das ferramentas.
