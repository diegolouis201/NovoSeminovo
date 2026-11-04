# Marketing NovoSeminovo — busca automática das ordens do CRM

Arquivos para a pasta do Marketing (repositório do Marketing no computador do
Diego). Futuramente esta pasta recebe o resto do Marketing e a atualização
automática, como o CRM (`crm-pacote/`).

- `scripts/buscar-ordens.mjs`: busca `GET /marketing/ordens` com a chave
  `NSN_FEED_KEY` do `.env` e salva `ordens-crm/ordens-do-dia.md` e
  `ordens-crm/ordens.json` (pasta só local: está no `.gitignore` do Marketing).
- `buscar-ordens.cmd`: o que o Agendador do Windows roda (registro em
  `ordens-crm/busca.log`).
- `agendar-busca-ordens.cmd` / `desligar-busca-ordens.cmd`: liga e desliga a
  busca diária das 07:30.
- Testes: `node --test scripts/*.test.mjs`.

A arte e a legenda continuam com o Claude do Marketing: ele lê o resumo ao
começar, monta as prévias e só publica com o OK do Diego.
