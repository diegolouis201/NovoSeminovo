import Link from "next/link";
import { ETAPAS_SUGERIDAS, OBJECOES, type RascunhoVista } from "@novoseminovo/shared-types";
import { RespostaDecisao } from "@/components/RespostaDecisao";
import { dataHora } from "@/lib/format";

// Uma resposta da empresa + o rascunho da assistente. A mensagem da empresa
// é texto de terceiro: aparece como texto (o React escapa), nunca como HTML.
export function RespostaCartao({ r }: { r: RascunhoVista }) {
  return (
    <article className="card space-y-4" aria-labelledby={`emp-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`emp-${r.id}`} className="h2"><Link className="hover:underline" href={`/empresas/${r.empresa.id}`}>{r.empresa.nome}</Link></h2>
          <p className="text-xs text-muted">{r.empresa.cidade ? `${r.empresa.cidade} · ` : ""}{r.empresa.etapa} · {r.vendedor.nome} · {r.canal === "whatsapp" ? "WhatsApp" : "E-mail"} · recebida {dataHora(r.mensagem.recebidaEm)}</p>
        </div>
        {r.escalar ? <span className="pill bg-orange/15 text-danger">Precisa de você: {r.escalar.rotulo}</span> : <span className="pill bg-blue/10 text-blue">Rascunho da IA</span>}
      </div>
      <div className="rounded-xl bg-cream p-3">
        <p className="label">Mensagem da empresa{r.mensagem.assunto ? ` · ${r.mensagem.assunto}` : ""}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{r.mensagem.texto}</p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div><dt className="inline text-muted">Objeção: </dt><dd className="inline font-semibold">{OBJECOES[r.objecao] ?? r.objecao}</dd></div>
        <div><dt className="inline text-muted">Etapa sugerida: </dt><dd className="inline font-semibold">{ETAPAS_SUGERIDAS[r.etapaSugerida] ?? r.etapaSugerida}</dd></div>
        <div><dt className="inline text-muted">Próximo contato: </dt><dd className="inline font-semibold">{r.proximoContatoDias ? `em ${r.proximoContatoDias} dia(s)` : "—"}</dd></div>
      </dl>
      {r.erro ? <p className="text-sm text-danger">Último erro: {r.erro}</p> : null}
      <RespostaDecisao id={r.id} texto={r.texto} semRascunho={!r.texto.trim()} />
    </article>
  );
}
