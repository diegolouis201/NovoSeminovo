# NovoSeminovo Hub (hub.novoseminovo.com.br)

CRM da empresa com login, ao vivo (mesmo banco do site). App separado
(`apps/hub`, Next.js, porta 3100): se o Hub cair, o marketplace continua no ar.

## Acesso
- Login com o e-mail e a senha da conta do site; depois a API confere o perfil
  (`GET /hub/me`). Quem não é da equipe não entra.
- Perfis (`HUB_PROFILES` em shared-types): **dono** (admin: tudo),
  **comercial** (vê e edita o CRM), **financeiro** (receitas), **leitura**
  (só vê o CRM). O dono dá e tira acesso em **Equipe e acessos**; vale na hora
  (o perfil é conferido no banco a cada chamada — `HubGuard`).
- Chave do login: `secrets/hub_auth_secret` (`sh scripts/criar-segredos.sh`).

## Telas
Início, Dashboard de vendas (meta do mês com ritmo), Funil, Empresas e ficha
(abas: resumo, atividades, tarefas, plano e uso, NPS e chamados, marcações),
Avisos do dia, Régua de relacionamento, Tarefas e agenda, NPS, Receitas
(só financeiro/dono) e Equipe e acessos (só dono).

## De onde vêm os dados
- Empresas e jornada: `GET /hub/crm` (mesmo feed do CRM, `CrmService.clientes`).
- Ações do Comercial (atividade, próximo contato, etapa): rotas `/sales/*`.
- Do Hub: tarefas (`hub_tasks`), meta do mês (`hub_goals`), marcações
  (`hub_marks`: importante, não contatar, tags, nota) e equipe (`hub_members`).
- Regras: as mesmas do CRM do computador, em `crm-pacote/scripts`
  (avisos, visão geral, agenda, botões e mensagens prontas) + `hub-regras.mjs`
  (régua, ritmo da meta, sem próximo passo, NPS pendente), com testes.

## Publicação
1. DNS: registro A `hub` → IP do servidor (igual ao `api`).
2. `sh scripts/criar-segredos.sh` (cria `secrets/hub_auth_secret`).
3. Deploy de sempre, incluindo `docker compose build hub`.

## Próximas fases
Login com Google @novoseminovo.com.br; financeiro (contas a pagar e receber,
extrato, fluxo de caixa, DRE) a partir da planilha e da sessão do Financeiro.
