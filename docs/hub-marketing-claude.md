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

**Não existe mais o Passaporte Digital / Diário do Carro** (decisão do Diego,
08/11/2026, por risco jurídico). Nada de Passaporte, Diário do Carro,
histórico do veículo, consulta por placa ou ficha técnica. O diferencial no
lugar é a **Vitrine do carro / Vitrine do imóvel**: no anúncio, o anunciante
gera um card para WhatsApp e Instagram (com o link do anúncio) e um cartaz
A4 com QR para imprimir e colar no vidro do carro ou no portão.

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
   **Excluir de vez** um conteúdo **cancelado** (limpar a lista de cancelados):
   `DELETE /marketing/conteudos/<id>` (mesma chave). Só funciona com status
   `cancelado` — os outros respondem erro; cancele antes com o `recolher`. O
   histórico do conteúdo sai junto e não dá para desfazer. No Hub, o mesmo
   botão aparece no conteúdo cancelado ("Excluir de vez").
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

## Padrão de UTM (todo link de anúncio pago)
O Hub cruza o gasto de cada campanha (Windsor) com os leads e cadastros que
chegaram pelo link, e mostra custo por lead e por cadastro em Marketing →
Gastos e orçamento. Para isso, todo link de anúncio leva:

| Parâmetro | Valor | Observação |
|---|---|---|
| `utm_source` | `meta` | (também vale `instagram` ou `facebook`) |
| `utm_medium` | `paid` | com `paid` o site classifica como "Anúncio Meta" |
| `utm_campaign` | nome **exato** da campanha no Gerenciador de Anúncios | é o que liga o gasto aos leads |
| `utm_content` | nome do anúncio | ex.: `video_vitrine_01` |
| `utm_term` | nome do público / conjunto de anúncios | ex.: `donos_de_loja_go` |

- O site guarda tudo em minúsculas e troca espaços por `_`, e faz o mesmo com
  o nome da campanha que vem do Windsor. Então "Lojas Novembro" no Gerenciador
  e `utm_campaign=Lojas%20Novembro` (ou `lojas_novembro`) casam. Qualquer
  outra diferença (acento, hífen no lugar de espaço, palavra a mais) não casa.
  Mais simples: dar à campanha um nome sem acento, como `lojas_novembro`, e
  usar o mesmo texto no link.
- Campanha com leads mas sem gasto aparece no Hub em "Campanhas do site sem
  gasto no período": é sinal de nome diferente entre o link e o Gerenciador.
- O `fbclid` que a Meta põe no link é guardado sozinho; não precisa fazer nada.
- Até 60 caracteres no nome da campanha; anúncio e público até 100.

Exemplos:
- Lojas e imobiliárias (formulário que vira lead no funil do Comercial):
  `https://novoseminovo.com.br/para-lojas/comecar?utm_source=meta&utm_medium=paid&utm_campaign=lojas_novembro&utm_content=video_vitrine_01&utm_term=donos_de_loja_go`
- Compradores (busca de carros; o contato no anúncio vira lead de comprador):
  `https://novoseminovo.com.br/carros?utm_source=meta&utm_medium=paid&utm_campaign=compradores_suv_novembro&utm_content=carrossel_suv_01&utm_term=interesse_carros_sp`

## Conversões da Meta (otimizar campanha por lead e cadastro)
Quando o Diego configurar o pixel (ver DEPLOY.md, "Meta Pixel e API de
Conversões"), o site passa a contar para a Meta, pelo navegador e pelo
servidor (mesmo evento, contado uma vez):
- `Lead`: formulário de `/para-lojas/comecar` (categoria `lojas`), contato
  e WhatsApp no anúncio (`veiculo`/`imovel`) e pedidos de financiamento.
- `CompleteRegistration`: cadastro de pessoa (`conta`) e de empresa (`lojas`).
Só de quem aceitou os cookies. Com isso, a campanha pode usar o objetivo
"Leads"/"Cadastros" no Gerenciador (otimizar por conversão no site, com o
pixel do NovoSeminovo) em vez de só cliques. Até o pixel existir, continue
otimizando por clique/visita e medindo pelos leads do Hub.

## Formulários de Lead Ads (Instagram/Facebook) caem no CRM
Quando o Diego configurar (ver DEPLOY.md, "Lead Ads da Meta"), todo
formulário de anúncio da página do NovoSeminovo entra sozinho no CRM, em
poucos segundos (e uma rotina confere de 30 em 30 minutos o que faltou):
- **Lojas, imobiliárias e corretores** viram card "Lead de campanha" no funil,
  com tarefa para o Comercial chamar. Para o site saber que é B2B, o **nome
  do formulário ou da campanha precisa ter** "lojas", "imobiliarias",
  "corretores", "parceiros" ou "b2b" (sem diferença de acento ou maiúscula) —
  ou o formulário pergunta o nome da empresa.
- **Compradores** (carros, imóveis, financiamento) aparecem em Marketing →
  Leads de compradores como "Formulário Meta", com campanha e anúncio.
- A campanha é ligada ao gasto pelo **nome da campanha no Gerenciador**, com a
  mesma regra do `utm_campaign` (minúsculas, espaços viram `_`): siga o padrão
  de UTM acima também para nomear campanhas de formulário.
- Perguntas personalizadas reconhecidas: nome, empresa, cidade, UF/estado,
  WhatsApp/telefone, e-mail, cargo, CNPJ e "tipo de empresa" (loja,
  imobiliária ou corretor). Lead sem e-mail e sem telefone é descartado.

## Rotina sugerida
- Toda segunda: montar o calendário da semana e enviar tudo ao Hub.
- Todo dia: olhar `status=ajuste` e mandar as novas versões.
- Ordens do CRM para o Marketing (boas-vindas nas redes etc.): criar o
  conteúdo com `ordemId` e concluir a ordem com o link depois de publicado.
- Dia 1º: relatório do mês com `GET /marketing/resultados`.
