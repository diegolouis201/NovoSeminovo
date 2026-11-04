# Jornada do cliente

## Etapas

| Etapa | Quem move | O que significa |
|---|---|---|
| A abordar | Comercial | Empresa na lista de prospecção |
| Em contato | Comercial | Já houve conversa |
| Interessada | Comercial | Mostrou interesse |
| Proposta enviada | Comercial | Recebeu proposta ou link de cadastro |
| Perdida | Comercial | Não quis (motivo registrado) |
| Cadastrou (período grátis) | Site | Criou a conta; 90 dias grátis |
| Publicou anúncio | Site | Tem anúncio no ar |
| Assinante | Site | Plano ativo (ou pagamento atrasado) |
| Cancelou | Site | Encerrou o plano |

## Campos de cada empresa (dados/clientes.json)

- `nome`, `tipo`, `segmento` (vehicle = lojas; property = imobiliárias, corretores, construtoras), `cnpj`, `cidade`, `uf`, `pais`, `pagina`
- `setor`, `porte`, `capitalSocial` (Receita), `perfil` (funcionários e faturamento em faixas, preenchidos pelo Comercial)
- `origemMarketing` (canal, meio e campanha de onde o responsável veio ao se cadastrar)
- `cadastroNoSiteEm` (cliente desde), `abertaEm` (abertura do CNPJ, Receita), `periodoGratisAte`, `verificada`
- `responsavel` (nome, cargo, e-mail, telefone), `socios` (nome, cargo, aniversário DD/MM quando preenchido)
- `etapa`, `vendedor`, `origem` (manual, site, link do vendedor), `proximoContato`
- `plano` (nome, valor mensal, status, desde, até), `pagamentos` (quantidade, total pago, ticket médio, primeiro, último)
- `uso` (último acesso ao painel, dias sem acesso, visualizações dos anúncios)
- `chamados` (total, abertos, aberto desde, tempo médio de resolução em horas, último assunto), `nps` (nota, data, comentário, promotor/neutro/detrator)
- `motivoPerda` (categoria e texto — perda na prospecção ou motivo do cancelamento), `proximoContatoTipo` (ligação, WhatsApp, e-mail, reunião)
- `anuncios` (no ar, total), `leads` (total, últimos 30 dias, vendidos, parados há mais de 3 dias)
- `ultimasAnotacoes` com `tipo`: note, ligacao, whatsapp, email, reuniao, dor, objecao, preferencia, stage, contact — `cardId` (card no /comercial)

`prospeccao`: empresas cadastradas pelo Comercial que ainda não entraram no site.

## Datas comemorativas

- Aniversário da empresa: `abertaEm` (Receita).
- Aniversário de parceria: `cadastroNoSiteEm` (1, 2, 3 anos de NovoSeminovo).
- Aniversário dos sócios: preenchido na ficha da empresa em /comercial.
- Datas do setor: `docs/datas-do-setor.csv` (editável; público todos, vehicle ou property).
