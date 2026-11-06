# Ligação do site com o CRM financeiro

O repositório "Financeiro NovoSeminovo" (sessão do Diego no Claude) lê do site
tudo o que entrou e o que há para pagar, e cruza com o Stripe (taxas e
repasses) e com o extrato da conta PJ (conciliação).

## Consulta

```
curl -s -H "Authorization: Bearer $NSN_FINANCE_KEY" "https://api.novoseminovo.com.br/financeiro/eventos?dias=30"
```

- `dias`: 1 a 730 (padrão 30). Traz o que foi pago, estornado ou mudou de
  status no período; `assinaturas` vem sempre completo (até 1000).
- `entradas[]`: `id`, `tipo` (`mensalidade`, `plano_anuncio`,
  `comissao_financiamento`, `comissao_lojas_parceiras`), `origem` (`stripe`,
  `banco`, `manual`), `descricao`, `cliente` {`nome`, `documento` (CNPJ), `email`},
  `valor`, `data`, `referencia` (fatura `in_...` ou sessão `cs_...` do Stripe),
  `estornado`, `valorEstornado`, `estornadoEm`.
- `saidas[]`: `id`, `tipo` (`comissao_afiliado`; o antigo
  `cashback_financiamento` não existe mais desde 06/11/2026),
  `descricao`, `favorecido`, `valor`, `status` (`aguardando`, `a_pagar`, `pago`,
  `cancelado`), `disponivelEm`, `pagoEm`, `criadoEm`.
- `assinaturas[]`: `id`, `empresa`, `cnpj`, `email`, `plano`, `valorMensal`,
  `status` (`ativa`, `em_atraso`, `cancelada`), `mudouEm`, `periodoAte`.
- Sem CPF, telefone, chave Pix ou cartão. Pagar afiliado continua sendo feito
  no admin do site (`/admin/afiliados`); a comissão de financiamento recebida é
  marcada em `/admin/comissoes`.
- Erros: 401 chave errada; 503 chave não configurada; 400 `dias` inválido;
  429 mais de 30 consultas por minuto.

## Chave

- Servidor: `secrets/finance_feed_key` (criada por `sh scripts/criar-segredos.sh`).
- Computador: `.env` da pasta do Financeiro, `NSN_FINANCE_KEY=<chave>`, com
  `.env` no `.gitignore`.
