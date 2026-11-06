"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { salvarEmailContato } from "@/lib/actions";
import { EnvelopeSimple, Phone, WhatsappLogo } from "@phosphor-icons/react";
// Mesmos botões e mensagens prontas do painel do CRM (testados lá).
import { MENSAGENS_INICIAIS, emailValido, linkEmail, linkLigar, linkWhatsApp, preencherMensagem, telefoneBr } from "../../../crm-pacote/scripts/painel-acoes.mjs";

type Msg = { nome: string; publico: string; assunto?: string; texto: string };
const NOMES: Record<string, string> = { responsavel: "nome do responsável", empresa: "nome da empresa", cidade: "cidade", seunome: "seu nome", fimgratis: "fim do período grátis", leadsparados: "clientes esperando", link: "link da página" };

// Uma pessoa por vez: o link só abre o WhatsApp ou o e-mail com o texto
// pronto; quem envia é você. Quem pediu para não ser contatado fica sem botão.
function Salvar() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Salvando..." : "Salvar no cadastro"}</button>;
}

export function Contato({ telefone, email, dados, segmento, naoContatar, contaEmail, card }: { telefone?: string; email?: string; dados: Record<string, string | number | undefined>; segmento?: string; naoContatar: boolean; contaEmail: string; card?: string }) {
  const [digitado, setDigitado] = useState("");
  const [salvo, salvar] = useFormState(salvarEmailContato, {});
  const destino = email || (emailValido(digitado) as string | null);
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
        {destino ? (
          <a className="btn" target="_blank" rel="noopener noreferrer" href={linkEmail("gmail", contaEmail, destino, assunto, preenchida.texto) as string}>
            <EnvelopeSimple size={18} /> E-mail
          </a>
        ) : (
          <span className="btn pointer-events-none opacity-50" aria-disabled="true">
            <EnvelopeSimple size={18} /> E-mail
          </span>
        )}
      </div>
      {!email ? (
        <form action={salvar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="card" value={card ?? ""} />
          <label className="sr-only" htmlFor="email-contato">E-mail do contato</label>
          <input id="email-contato" name="email" type="email" className="input min-w-0 flex-1" placeholder="Sem e-mail no cadastro: digite para enviar" maxLength={200} value={digitado} onChange={(e) => setDigitado(e.target.value)} />
          {card && destino ? <Salvar /> : null}
          {digitado && !destino ? <span className="w-full text-xs font-semibold text-orange">Confira o e-mail digitado.</span> : null}
          {salvo.ok ? <span className="w-full text-xs font-semibold text-green">{salvo.ok}</span> : null}
          {salvo.erro ? <span className="w-full text-xs font-semibold text-danger">{salvo.erro}</span> : null}
        </form>
      ) : null}
      {fone || destino ? (
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
