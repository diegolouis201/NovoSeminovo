// Recolhe do Hub os conteúdos que citam cashback (decisão do Diego: o
// cashback saiu do modelo de negócios). Só mexe no que ainda não foi ao ar.
// - título sobre cashback → cancela
// - cita cashback em legenda/hashtags/detalhes → volta para ajuste
// Uso: node recolher-cashback.mjs <url-api>            (só mostra a lista)
//      node recolher-cashback.mjs <url-api> --aplicar  (faz)
// Chave em MKT_KEY.
const [base, flag] = process.argv.slice(2);
const aplicar = flag === "--aplicar";
const auth = { Authorization: `Bearer ${process.env.MKT_KEY}` };
const MOTIVO_AJUSTE =
  "Mudança no modelo de negócios: o NovoSeminovo NÃO oferece mais cashback no financiamento. Tire toda menção a cashback (legenda, hashtags, roteiro, arte e locução do vídeo) e mantenha o resto. O financiamento continua: pode citar que dá para simular o financiamento no próprio anúncio. Mande a nova versão para aprovação.";
const MOTIVO_CANCELAR = "Mudança no modelo de negócios: o NovoSeminovo não oferece mais cashback no financiamento. Post cancelado.";
const ABERTOS = ["em_aprovacao", "aprovado", "erro", "rascunho"];

const r = await fetch(`${base}/marketing/conteudos`, { headers: auth });
if (!r.ok) throw new Error(`Lista: ${r.status} ${await r.text()}`);
const lista = await r.json();
const cita = (c) => /cashback/i.test(JSON.stringify([c.titulo, c.legenda, c.hashtags, c.detalhes ?? {}, c.impulso ?? {}]));
const alvo = lista.filter((c) => ABERTOS.includes(c.status) && cita(c));
const feitos = { ajuste: 0, cancelado: 0, erros: [] };
for (const c of alvo) {
  const acao = /cashback/i.test(c.titulo) ? "cancelar" : "ajuste";
  console.log(`${acao === "cancelar" ? "CANCELAR" : "AJUSTE  "} | ${String(c.dataPlanejada ?? "").slice(0, 10)} | ${c.redes.join(",")} | ${c.titulo}`);
  if (!aplicar) continue;
  const res = await fetch(`${base}/marketing/conteudos/${c.id}/recolher`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ acao, motivo: acao === "cancelar" ? MOTIVO_CANCELAR : MOTIVO_AJUSTE }),
  });
  if (res.ok) feitos[acao === "cancelar" ? "cancelado" : "ajuste"]++;
  else feitos.erros.push(`${c.titulo}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
console.log(aplicar ? JSON.stringify(feitos, null, 1) : `\n${alvo.length} conteúdos. Para aplicar, rode de novo com --aplicar.`);
