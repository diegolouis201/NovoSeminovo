# Ligação do site com o CRM de marketing

O site informa ao CRM de marketing (repositório "Marketing NovoSeminovo" no
Claude) quais lojas, imobiliárias, corretores e construtoras se cadastraram e
em que etapa estão, para a comunicação mudar quando o lead converte.

## Consulta

```
curl -s -H "Authorization: Bearer $NSN_FEED_KEY" "https://api.novoseminovo.com.br/marketing/conversoes?dias=30"
```

- `dias`: de 1 a 365 (padrão 30) — empresas cadastradas nesse período.
- Resposta: `{ geradoEm, desde, empresas: [...] }`. Cada empresa:
  `id`, `nome`, `tipo` (Loja de veículos, Imobiliária, Corretor(a), Oficina,
  Construtora), `cnpj`, `email` (do dono da conta), `cidade`, `cadastradoEm`,
  `verificada`, `etapa`, `anunciosAtivos`, `emTeste`, `plano`.
- `etapa`:
  - `cadastrou` — criou a conta de empresa, ainda sem anúncio no ar;
  - `publicou_anuncio` — tem anúncio no ar;
  - `assinante` — tem plano pago ativo (ou com pagamento atrasado).
- Sem telefone, CPF ou dado de pagamento. Para casar com o CRM use CNPJ
  (só dígitos) ou e-mail.
- Erros: 401 chave errada; 503 chave não configurada no servidor; 400 `dias`
  fora de 1–365; 429 mais de 30 consultas por minuto.

## Chave

- No servidor: arquivo `secrets/marketing_feed_key`, criado por
  `sh scripts/criar-segredos.sh` (DEPLOY.md, "Chaves secretas").
- No computador, na pasta do repositório de marketing: arquivo `.env` com
  `NSN_FEED_KEY=<chave>`, e `.env` listado no `.gitignore` desse repositório.
  Nunca colar a chave em chat, e-mail ou commit.
- Trocar: `sh scripts/criar-segredos.sh --trocar` no servidor,
  `docker compose restart api`, e atualizar o `.env` do computador.

## Uso sugerido no CRM

1. Uma vez por dia, consultar `dias=2` (ou `dias=30` na primeira vez).
2. Para cada empresa: achar o lead pelo CNPJ ou e-mail; se não existir, criar.
3. Mudar a etapa e a comunicação:
   - `cadastrou` → sai da prospecção; entra na sequência "publique o primeiro
     anúncio" (cadastro com IA a partir das fotos, importação por integração);
   - `publicou_anuncio` + `emTeste` → dicas para vender mais e lembrete do fim
     do período grátis;
   - `assinante` → comunicação de cliente (novidades, indicação); nada de
     oferta de entrada.
