# Para o Claude do Marketing: enviar conteúdos para o NovoSeminovo Hub

Cole este texto nas instruções (CLAUDE.md) da pasta do Marketing no
computador do Diego. A chave é a mesma que já está no `.env` do Marketing
(`NSN_FEED_KEY`). Nunca mostre a chave no chat.

## Regra
Todo conteúdo (post, carrossel, reels, story, vídeo, e-mail, WhatsApp,
anúncio pago) vai para aprovação no Hub (https://hub.novoseminovo.com.br,
tela Marketing → Aprovações). Não publique nada por fora e não use artefatos
para pedir aprovação: o Diego aprova no Hub, e o Hub publica sozinho no
Instagram e no Facebook na hora marcada. TikTok, YouTube, vídeos, e-mail e
WhatsApp: depois de aprovado, quem publica marca o link no Hub.

**Não existe mais cashback** (decisão do Diego, 06/11/2026). Nada de
cashback, "dinheiro de volta" ou vantagem em dinheiro no financiamento em
legenda, hashtag, arte, roteiro ou locução. O financiamento continua: pode
dizer que dá para simular o financiamento no próprio anúncio, sempre com
"O NovoSeminovo não é instituição financeira e não concede crédito".

## Como enviar (API do site, com a chave)
Base: `https://api.novoseminovo.com.br`, cabeçalho
`Authorization: Bearer <NSN_FEED_KEY>` e `Content-Type: application/json`.

1. **Imagem** (JPEG/PNG, até 8 MB): `POST /marketing/midias`
   corpo `{"nome": "arte.png", "base64": "<arquivo em base64>"}` → `{"url": "/uploads/....jpg"}`.
   Use a `url` devolvida no conteúdo. **Vídeo MP4** (até 150 MB):
   `POST /marketing/midias/video` em multipart, campo `video` → `{"url": ...}`.
2. **Conteúdo**: `POST /marketing/conteudos`
   ```json
   {
     "tipo": "post | carrossel | reels | story | video | email | whatsapp | anuncio",
     "redes": ["instagram", "facebook", "tiktok", "youtube", "email", "whatsapp", "meta_ads", "google_ads", "tiktok_ads"],
     "titulo": "Nome interno curto",
     "legenda": "Texto do post (sem preço nem desconto; atuação no Brasil todo)",
     "hashtags": ["novoseminovo", "carros"],
     "midias": ["/uploads/....jpg"],
     "dataPlanejada": "2026-11-10T12:00:00-03:00",
     "campanha": {"plataforma": "meta_ads", "orcamento": 600, "objetivo": "...", "publico": "..."},
     "observacao": "O que o Diego precisa saber para aprovar",
     "ordemId": "id da ordem do CRM, se veio de uma",
     "origemId": "id seu, único: reenviar com o mesmo id não duplica",
     "detalhes": {"pilar": "...", "formato": "Reel", "roteiro": "...", "gancho": "...", "cta": "..."},
     "impulso": {"status": "proposto", "orcamentoDia": 10, "dias": 7, "inicio": "2026-12-02", "objetivo": "Visitas ao site", "publico": "...", "local": "...", "idade": "25 a 60"}
   }
   ```
   Carrossel: 2 a 10 imagens. `campanha` só para anúncio pago.
3. **Acompanhar**: `GET /marketing/conteudos?status=ajuste` traz o que o Diego
   pediu para ajustar (campo `feedback`). Outros status: `em_aprovacao`,
   `aprovado`, `publicado`, `erro`, `cancelado`.
4. **Nova versão depois do ajuste**: `POST /marketing/conteudos/<id>/revisao`
   com só o que mudou e `"resposta": "o que foi ajustado"`. Volta para a fila
   de aprovação como nova versão.
5. **Recolher** um conteúdo que ainda não foi ao ar: `POST /marketing/conteudos/<id>/recolher`
   com `{"acao": "ajuste" | "cancelar", "motivo": "..."}`.
6. **Resultados**: `GET /marketing/resultados` → gastos do mês (Meta, Google,
   TikTok contra o orçamento, custo por cadastro e por assinatura) e análises
   (Instagram, origem das visitas, posts publicados). Use para o relatório e
   para sugerir o que repetir.

6. **Estratégia por plataforma**: `POST /marketing/estrategias/<rede>` com
   `objetivo, publico, frequencia, formatos, horario, tom, notas, status`.
   **Regras de impulsionamento**: `POST /marketing/impulso/regras` com
   `objetivo, criterios, publicos, orcamento, execucao, regras, limiteDia`.
   Impulso só roda depois que o Diego aprova no Hub (Marketing → Impulsionamento).
7. **Prospecção** (empresas achadas no Google Maps etc.): `POST /marketing/prospeccao`
   com uma lista (até 3000) de `{id, empresa, tipo, cidade, uf, telefone, email,
   site, endereco, nota, avaliacoes}`. Viram cards "A abordar" no CRM do Hub,
   sem duplicar pelo `id`.

## Rotina sugerida
- Toda segunda: montar o calendário da semana e enviar tudo ao Hub.
- Todo dia: olhar `status=ajuste` e mandar as novas versões.
- Ordens do CRM para o Marketing (boas-vindas nas redes etc.): criar o
  conteúdo com `ordemId` e concluir a ordem com o link depois de publicado.
- Dia 1º: relatório do mês com `GET /marketing/resultados`.
