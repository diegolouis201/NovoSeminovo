import { MKT_REDES, MKT_STATUS, MKT_TIPOS } from "@novoseminovo/shared-types";
import { COR_STATUS, ehImagem, ehVideo, midiaUrl, type Conteudo } from "@/lib/mkt";
import { dataHora } from "@/lib/format";

// Prévia no formato de post: imagens, legenda e hashtags como vão aparecer.
export function Previa({ c, compacta = false }: { c: Conteudo; compacta?: boolean }) {
  const imagens = c.midias.filter((m) => ehImagem(m) || ehVideo(m));
  const links = c.midias.filter((m) => !ehImagem(m) && !ehVideo(m));
  const d = c.detalhes ?? {};
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <img src="/logo.png" alt="" className="h-7 w-7 rounded-full border border-line object-contain p-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">novoseminovooficial</p>
          <p className="truncate text-[11px] text-muted">{MKT_TIPOS[c.tipo as keyof typeof MKT_TIPOS] ?? c.tipo} · {c.redes.map((r) => MKT_REDES[r as keyof typeof MKT_REDES] ?? r).join(", ")}</p>
        </div>
        <span className={`pill ${COR_STATUS[c.status] ?? ""}`}>{MKT_STATUS[c.status as keyof typeof MKT_STATUS] ?? c.status}</span>
      </div>
      {imagens.length ? (
        <div className={`grid ${imagens.length > 1 ? "grid-flow-col auto-cols-[85%] overflow-x-auto" : ""} gap-1 bg-cream`}>
          {imagens.map((u) =>
            ehVideo(u) ? (
              <video key={u} src={midiaUrl(u)} controls muted playsInline preload="metadata" className={`w-full bg-black object-contain ${compacta ? "max-h-48" : "aspect-[9/16] max-h-[32rem]"}`} />
            ) : (
              <img key={u} src={midiaUrl(u)} alt="" className={`w-full object-cover ${compacta ? "aspect-square max-h-48" : "aspect-square"}`} />
            ),
          )}
        </div>
      ) : (
        <div className="flex aspect-[4/1] items-center justify-center bg-cream text-xs text-muted">sem imagem</div>
      )}
      <div className="space-y-1 p-3 text-sm">
        {d.pilar || d.formato || c.impulso ? (
          <p className="flex flex-wrap gap-1">
            {d.pilar ? <span className="pill bg-line text-navy">{d.pilar}</span> : null}
            {d.formato ? <span className="pill bg-line text-navy">{d.formato}</span> : null}
            {c.impulso ? <span className="pill bg-orange/15 text-orange">⚡ Impulso R$ {c.impulso.orcamentoDia ?? "?"}/dia × {c.impulso.dias ?? "?"} dias</span> : null}
          </p>
        ) : null}
        <p className="font-semibold text-navy">{c.titulo}{c.revisao > 1 ? <span className="ml-2 text-xs text-muted">versão {c.revisao}</span> : null}</p>
        {!compacta || c.legenda.length < 280 ? <p className="whitespace-pre-wrap">{c.legenda}</p> : <p className="whitespace-pre-wrap">{c.legenda.slice(0, 280)}…</p>}
        {c.hashtags.length ? <p className="text-blue">{c.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p> : null}
        {!compacta && d.roteiro ? (
          <details className="rounded-lg bg-cream p-2 text-xs"><summary className="cursor-pointer font-semibold">Roteiro / telas</summary><p className="mt-1 whitespace-pre-wrap">{d.roteiro}</p></details>
        ) : null}
        {!compacta && (d.gancho || d.cta || d.objetivo) ? (
          <p className="text-xs text-muted">{[d.gancho ? `Gancho: ${d.gancho}` : "", d.cta ? `CTA: ${d.cta}` : "", d.objetivo ? `Objetivo: ${d.objetivo}` : ""].filter(Boolean).join(" · ")}</p>
        ) : null}
        {links.map((l) => (
          <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="link block truncate text-xs">{l}</a>
        ))}
        {c.campanha ? (
          <p className="rounded-lg bg-cream p-2 text-xs">
            Anúncio {c.campanha.plataforma ?? ""}{c.campanha.orcamento ? ` · orçamento R$ ${c.campanha.orcamento.toLocaleString("pt-BR")}` : ""}{c.campanha.objetivo ? ` · ${c.campanha.objetivo}` : ""}{c.campanha.publico ? ` · público: ${c.campanha.publico}` : ""}
          </p>
        ) : null}
        <p className="text-xs text-muted">{c.dataPlanejada ? `Para ${dataHora(c.dataPlanejada)}` : "Sem data"} · {c.origem === "claude" ? "Claude do Marketing" : "criado no Hub"}</p>
      </div>
    </div>
  );
}
