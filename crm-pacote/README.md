# CRM NovoSeminovo

Gestão de toda a empresa num lugar só: jornada de cada cliente, datas
comemorativas, sócios, marcações, avisos inteligentes e ordens para todas
as áreas (Comercial, Atendimento, Financeiro, Marketing e Operações).

Funciona como os CRMs de Marketing e Financeiro: uma pasta no seu computador
e uma sessão do Claude que lê o site com uma chave secreta.

## Instalar (uma vez)

1. Descompacte esta pasta em `Documentos\CRM NovoSeminovo`.
2. Instale o Node.js (versão LTS) em nodejs.org, se ainda não tiver.
3. No servidor, crie a chave do CRM (veja o passo a passo enviado no chat).
4. Copie `.env.exemplo` para `.env` no Bloco de Notas e cole a chave na linha
   `NSN_CRM_KEY=`. Salve como "Todos os arquivos".
5. Abra a pasta no Claude e mande o conteúdo de `PRIMEIRA-TAREFA.md`.
6. Sincronização automática: dê dois cliques em `agendar-sincronizacao.cmd`.
   O CRM passa a buscar os dados do site sozinho todo dia às 07:30 (se o
   computador estiver desligado, roda assim que ligar) e atualiza o painel.
   Para desligar: `desligar-sincronizacao.cmd`. O registro de cada
   sincronização fica em `relatorios/sincronizacao.log`.

## Ver as telas do CRM

Todas as telas ficam no seu computador, não no site (o site fica mais leve):

1. Atualize os dados: `node scripts/sincronizar.mjs` (ou peça ao Claude
   "sincroniza o CRM").
2. Abra o painel: `start relatorios\painel.html` (abre no navegador).

Abas: **Visão geral** (geral, veículos, imóveis), **Receitas**, **Empresas**
(busca, filtros e a ficha completa de cada uma), **Prospecção**, **Avisos**,
**Ordens** e **Agenda** (próximos 60 dias). Funciona sem internet.

## Atualizações

O CRM se atualiza sozinho toda manhã, junto com a sincronização: quando o
site é publicado com uma versão nova do CRM, no dia seguinte esta pasta já
está atualizada. Não precisa descompactar zip. O `.env` e os dados nunca são
alterados pela atualização.

## Segurança

- O `.env` (chave) e as pastas `dados`, `relatorios` e `campanhas` nunca vão
  para o GitHub (estão no `.gitignore`).
- Nunca mande a chave no chat nem em print.
- O `painel.html` tem dados de clientes: não envie a ninguém.
