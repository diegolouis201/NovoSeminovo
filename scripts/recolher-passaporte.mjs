// Recolhe do Hub os conteúdos que citam o Passaporte Digital / Diário do
// Carro (descontinuado em 08/11/2026 por risco jurídico). Só mexe no que
// ainda não foi ao ar.
// - título sobre o Passaporte/Diário → cancela
// - cita em legenda/hashtags/detalhes/impulso → volta para ajuste
// Uso: node recolher-passaporte.mjs <url-api>            (só mostra a lista)
//      node recolher-passaporte.mjs <url-api> --aplicar  (faz)
// Chave em MKT_KEY.
const [base, flag] = process.argv.slice(2);
const aplicar = flag === "--aplicar";
const auth = { Authorization: `Bearer ${process.env.MKT_KEY}` };
const TERMO = /passaporte|di[aá]rio do carro|hist[oó]rico (completo )?do (carro|ve[ií]culo)|consultar-veiculo|ficha t[eé]cnica/i;
const MOTIVO_AJUSTE =
  "O Passaporte Digital / Diário do Carro foi descontinuado (risco jurídico). Tire toda menção a Passaporte, Diário do Carro, histórico do veículo, consulta por placa e ficha técnica (legenda, hashtags, roteiro, arte e locução). Se quiser um diferencial no lugar, use a Vitrine do carro/imóvel: o anunciante gera um card para WhatsApp/Instagram e um cartaz para imprimir e colar no vidro do carro ou no portão. Mande a nova versão para aprovação.";
const MOTIVO_CANCELAR = "O Passaporte Digital / Diário do Carro foi descontinuado (risco jurídico). Post cancelado.";
const ABERTOS = ["em_aprovacao", "aprovado", "erro", "rascunho"];

const r = await fetch(`${base}/marketing/conteudos`, { headers: auth });
if (!r.ok) throw new Error(`Lista: ${r.status} ${await r.text()}`);
const lista = await r.json();
const cita = (c) => TERMO.test(JSON.stringify([c.titulo, c.legenda, c.hashtags, c.detalhes ?? {}, c.impulso ?? {}]));
const alvo = lista.filter((c) => ABERTOS.includes(c.status) && cita(c));
const outros = lista.filter((c) => !ABERTOS.includes(c.status) && c.status !== "cancelado" && cita(c));
const feitos = { ajuste: 0, cancelado: 0, erros: [] };
for (const c of alvo) {
  const acao = TERMO.test(c.titulo) ? "cancelar" : "ajuste";
  console.log(`${acao === "cancelar" ? "CANCELAR" : "AJUSTE  "} | ${c.status} | ${String(c.dataPlanejada ?? "").slice(0, 10)} | ${c.redes.join(",")} | ${c.titulo}`);
  if (!aplicar) continue;
  const res = await fetch(`${base}/marketing/conteudos/${c.id}/recolher`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ acao, motivo: acao === "cancelar" ? MOTIVO_CANCELAR : MOTIVO_AJUSTE }),
  });
  if (res.ok) feitos[acao === "cancelar" ? "cancelado" : "ajuste"]++;
  else feitos.erros.push(`${c.titulo}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
for (const c of outros) console.log(`ATENÇÃO  | ${c.status} | ${String(c.dataPlanejada ?? "").slice(0, 10)} | ${c.redes.join(",")} | ${c.titulo} (já publicado ou em ajuste: veja no Hub)`);
console.log(aplicar ? JSON.stringify(feitos, null, 1) : `\n${alvo.length} para recolher. Para aplicar, rode de novo com --aplicar.`);
