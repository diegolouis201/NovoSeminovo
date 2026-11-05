"use client";

import { useMemo, useState } from "react";
import { EnvelopeSimple, Phone, WhatsappLogo } from "@phosphor-icons/react";
// Mesmos botões e mensagens prontas do painel do CRM (testados lá).
import { MENSAGENS_INICIAIS, linkEmail, linkLigar, linkWhatsApp, preencherMensagem, telefoneBr } from "../../../crm-pacote/scripts/painel-acoes.mjs";

type Msg = { nome: string; publico: string; assunto?: string; texto: string };
const NOMES: Record<string, string> = { responsavel: "nome do responsável", empresa: "nome da empresa", cidade: "cidade", seunome: "seu nome", fimgratis: "fim do período grátis", leadsparados: "clientes esperando", link: "link da página" };

// Uma pessoa por vez: o link só abre o WhatsApp ou o e-mail com o texto
// pronto; quem envia é você. Quem pediu para não ser contatado fica sem botão.
export function Contato({ telefone, email, dados, segmento, naoContatar, contaEmail }: { telefone?: string; email?: string; dados: Record<string, string | number | undefined>; segmento?: string; naoContatar: boolean; contaEmail: string }) {
  const msgs = (MENSAGENS_INICIAIS as Msg[]).filter((m) => m.publico === "todos" || m.publico === segmento);
  const [escolha, setEscolha] = useState(0);
  const msg = msgs[escolha];
  const preenchida = useMemo(() => (msg ? preencherMensagem(msg.texto, dados) : { texto: "", faltando: [] }), [msg, dados]);
  const assunto = useMemo(() => (msg?.assunto ? preencherMensagem(msg.assunto, dados).texto : ""), [msg, dados]);
  const fone = telefoneBr(telefone) as string | null;

  if (naoContatar) return <p className="rounded-xl bg-orange/10 p-3 text-sm font-semibold text-danger">Pediu para não ser contatada (LGPD). Ligar, WhatsApp e e-mail desligados.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {fone ? (
          <a className="btn" href={linkLigar(telefone) as string}>
            <Phone size={18} /> Ligar
          </a>
        ) : null}
        {fone ? (
          <a className="btn" target="_blank" rel="noopener noreferrer" href={linkWhatsApp("wame", fone, preenchida.texto) as string}>
            <WhatsappLogo size={18} /> WhatsApp
          </a>
        ) : null}
        {email ? (
          <a className="btn" target="_blank" rel="noopener noreferrer" href={linkEmail("gmail", contaEmail, email, assunto, preenchida.texto) as string}>
            <EnvelopeSimple size={18} /> E-mail
          </a>
        ) : null}
        {!fone && !email ? <span className="text-sm text-muted">Sem telefone nem e-mail cadastrados.</span> : null}
      </div>
      {fone || email ? (
        <div>
          <label className="label" htmlFor="msg">Mensagem pronta</label>
          <select id="msg" className="input" value={escolha} onChange={(e) => setEscolha(Number(e.target.value))}>
            {msgs.map((m, i) => (
              <option key={m.nome} value={i}>{m.nome}</option>
            ))}
          </select>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-3 text-sm text-ink">{preenchida.texto}</p>
          {preenchida.faltando.length ? <p className="mt-1 text-xs font-semibold text-orange">Complete antes de enviar: {preenchida.faltando.map((c: string) => NOMES[c] ?? c).join(", ")} (aparece como ___).</p> : null}
        </div>
      ) : null}
    </div>
  );
}
