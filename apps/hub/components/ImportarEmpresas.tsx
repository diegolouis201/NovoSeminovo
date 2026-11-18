"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { PROSPECCAO_ETIQUETA_PADRAO, PROSPECCAO_SEGMENTOS, type ProspeccaoAnalise, type ProspeccaoResultado } from "@novoseminovo/shared-types";
import { analisarImportacao, confirmarImportacao } from "@/lib/actions";

const SITUACAO = { nova: ["Nova", "bg-green/15 text-green"], duplicada: ["Duplicada", "bg-orange/15 text-danger"], invalida: ["Inválida", "bg-line text-muted"] } as const;
const num = (n: number) => n.toLocaleString("pt-BR");

// Importar empresas do Mailerfind em dois passos: analisar (prévia, nada é
// gravado) e confirmar (o mesmo arquivo; a API confere que não mudou).
export function ImportarEmpresas() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [etiqueta, setEtiqueta] = useState(PROSPECCAO_ETIQUETA_PADRAO);
  const [segmento, setSegmento] = useState<keyof typeof PROSPECCAO_SEGMENTOS>("vehicle");
  const [analise, setAnalise] = useState<ProspeccaoAnalise | null>(null);
  const [resultado, setResultado] = useState<ProspeccaoResultado | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const [acao, setAcao] = useState<"analisar" | "confirmar" | null>(null);
  const previaRef = useRef<HTMLHeadingElement>(null);
  const resultadoRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (analise && !resultado) previaRef.current?.focus();
  }, [analise, resultado]);
  useEffect(() => {
    if (resultado) resultadoRef.current?.focus();
  }, [resultado]);

  const dados = () => {
    const fd = new FormData();
    if (arquivo) fd.append("arquivo", arquivo, arquivo.name);
    return fd;
  };

  const analisar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setResultado(null);
    setAcao("analisar");
    iniciar(async () => {
      const r = await analisarImportacao(dados());
      setAnalise(r.analise ?? null);
      setErro(r.erro ?? "");
    });
  };

  const confirmar = () => {
    if (!analise) return;
    setErro("");
    setAcao("confirmar");
    const fd = dados();
    fd.append("hash", analise.hash);
    fd.append("etiqueta", etiqueta);
    fd.append("segmento", segmento);
    iniciar(async () => {
      const r = await confirmarImportacao(fd);
      if (r.resultado) setResultado(r.resultado);
      setErro(r.erro ?? "");
    });
  };

  const baixarRelatorio = () => {
    if (!resultado) return;
    // BOM: o Excel abre os acentos certo. As células já vêm sem fórmula da API.
    const blob = new Blob(["﻿", resultado.relatorioCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "importacao-recusadas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const c = analise?.contagens;
  return (
    <div className="space-y-6" data-pronto>
      <section className="card" aria-labelledby="passo1">
        <h2 id="passo1" className="h2 mb-4">1. Arquivo e campanha</h2>
        <form onSubmit={analisar} className="space-y-4" aria-labelledby="passo1">
          <div>
            <label className="label" htmlFor="arquivo">Arquivo CSV do Mailerfind <span aria-hidden="true">*</span></label>
            <input
              id="arquivo"
              name="arquivo"
              type="file"
              accept=".csv,text/csv,text/plain"
              required
              aria-describedby="arquivo-ajuda"
              className="input"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setAnalise(null);
                setResultado(null);
                setErro("");
              }}
            />
            <p id="arquivo-ajuda" className="mt-1 text-xs text-muted">No Mailerfind: Prospects (ou a análise do Google Maps) → Export CSV. Até 5 MB e 5.000 empresas.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="etiqueta">Etiqueta da campanha <span aria-hidden="true">*</span></label>
              <input id="etiqueta" name="etiqueta" required maxLength={60} className="input" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} aria-describedby="etiqueta-ajuda" />
              <p id="etiqueta-ajuda" className="mt-1 text-xs text-muted">Aparece na lista de Empresas e serve para filtrar e inscrever na sequência de e-mails.</p>
            </div>
            <fieldset>
              <legend className="label">Tipo de empresa</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {Object.entries(PROSPECCAO_SEGMENTOS).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" id={`seg-${k}`} name="segmento" value={k} checked={segmento === k} onChange={() => setSegmento(k as keyof typeof PROSPECCAO_SEGMENTOS)} className="accent-blue" />
                    <label htmlFor={`seg-${k}`}>{v.label}</label>
                  </span>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={pendente}>{pendente && acao === "analisar" ? "Analisando..." : "Analisar arquivo"}</button>
            <span role="alert" className="text-sm font-semibold text-danger">{erro}</span>
          </div>
        </form>
      </section>

      {analise && c ? (
        <section className="card" aria-labelledby="passo2">
          <h2 id="passo2" ref={previaRef} tabIndex={-1} className="h2 mb-1 outline-none">2. Confira antes de importar</h2>
          <p className="mb-4 text-sm text-muted">Nada foi gravado ainda. {num(analise.total)} empresas no arquivo.</p>
          {analise.jaImportadoEm ? <p className="mb-4 rounded-xl bg-orange/10 p-3 text-sm font-semibold text-danger">Este mesmo arquivo já foi importado em {new Date(analise.jaImportadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Nada será duplicado.</p> : null}
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Novas", c.novas, "text-green"],
              ["Já no CRM", c.jaNoCrm, "text-orange"],
              ["Já parceiras do site", c.jaParceiras, "text-orange"],
              ["Repetidas no arquivo", c.repetidasNoArquivo, "text-orange"],
              ["Inválidas", c.invalidas, "text-muted"],
            ].map(([rotulo, valor, cor]) => (
              <div key={rotulo as string} className="rounded-xl bg-cream p-3">
                <dt className="text-xs text-muted">{rotulo}</dt>
                <dd className={`font-display text-2xl font-semibold ${cor}`}>{num(valor as number)}</dd>
              </div>
            ))}
          </dl>
          {c.emailsDescartados ? <p className="mb-4 text-xs text-muted">{num(c.emailsDescartados)} e-mail(s) com formato inválido foram ignorados (a empresa entra pelo telefone).</p> : null}

          <h3 className="mb-2 text-sm font-semibold text-navy">Colunas reconhecidas</h3>
          <ul className="mb-2 flex flex-wrap gap-2 text-xs">
            {analise.colunas.filter((col) => col.coluna).map((col) => (
              <li key={col.campo} className="pill bg-blue/10 text-blue">{col.rotulo}: {col.coluna}</li>
            ))}
          </ul>
          {analise.colunasIgnoradas.length ? <p className="mb-5 text-xs text-muted">Ignoradas: {analise.colunasIgnoradas.join(", ")}</p> : null}

          <div tabIndex={0} role="region" aria-labelledby="previa-titulo" className="mb-5 max-h-[28rem] overflow-auto rounded-xl border border-line">
            <table className="tabela min-w-[820px]">
              <caption id="previa-titulo" className="p-3 text-left text-sm font-semibold text-navy">Prévia das primeiras {analise.previa.length} linhas</caption>
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Empresa</th>
                  <th scope="col">Contato</th>
                  <th scope="col">Cidade</th>
                  <th scope="col">Google</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {analise.previa.map((l) => (
                  <tr key={l.linha}>
                    <td className="text-muted">{l.linha}</td>
                    <th scope="row" className="!text-sm !font-semibold !normal-case !tracking-normal !text-navy">{l.nome || "—"}{l.categoria ? <span className="block text-xs font-normal text-muted">{l.categoria}</span> : null}</th>
                    <td>{l.telefone ?? ""}<span className="block text-xs text-muted">{l.email ?? ""}</span></td>
                    <td>{[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</td>
                    <td>{l.nota !== undefined ? `${String(l.nota).replace(".", ",")} ★ (${num(l.avaliacoes ?? 0)})` : "—"}</td>
                    <td>
                      <span className={`pill ${SITUACAO[l.situacao][1]}`}>{SITUACAO[l.situacao][0]}</span>
                      {l.motivo ? <span className="mt-1 block text-xs text-muted">{l.motivo}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!resultado ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" onClick={confirmar} disabled={pendente || c.novas === 0}>
                {pendente && acao === "confirmar" ? "Importando..." : `Confirmar importação de ${num(c.novas)} empresa(s)`}
              </button>
              <span className="text-xs text-muted">Entram como “A abordar”, origem Mailerfind, etiqueta “{etiqueta.trim()}”. Nenhuma mensagem é enviada.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {resultado ? (
        <section className="card" aria-labelledby="passo3" role="status">
          <h2 id="passo3" ref={resultadoRef} tabIndex={-1} className="h2 mb-4 outline-none">Importação concluída</h2>
          <dl className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-green/10 p-3"><dt className="text-xs text-muted">Criadas</dt><dd className="font-display text-2xl font-semibold text-green">{num(resultado.criadas)}</dd></div>
            <div className="rounded-xl bg-cream p-3"><dt className="text-xs text-muted">Duplicadas (não entraram)</dt><dd className="font-display text-2xl font-semibold text-orange">{num(resultado.duplicadas.length)}</dd></div>
            <div className="rounded-xl bg-cream p-3"><dt className="text-xs text-muted">Inválidas</dt><dd className="font-display text-2xl font-semibold text-muted">{num(resultado.invalidas.length)}</dd></div>
          </dl>
          {resultado.duplicadas.length || resultado.invalidas.length ? (
            <>
              <ul className="mb-4 max-h-56 space-y-1 overflow-auto text-sm">
                {[...resultado.duplicadas, ...resultado.invalidas].sort((a, b) => a.linha - b.linha).slice(0, 100).map((d) => (
                  <li key={d.linha}><span className="text-muted">Linha {d.linha}</span> · <b className="text-navy">{d.nome || "sem nome"}</b> · {d.motivo}</li>
                ))}
              </ul>
              <button type="button" className="btn" onClick={baixarRelatorio}>Baixar recusadas com o motivo (CSV)</button>
            </>
          ) : null}
          <p className="mt-4 text-sm">
            <Link className="link" href={`/empresas?etiqueta=${encodeURIComponent(etiqueta.trim())}`}>Ver as empresas desta campanha</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
