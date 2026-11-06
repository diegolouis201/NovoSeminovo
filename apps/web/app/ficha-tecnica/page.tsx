import type { Metadata } from "next";
import Link from "next/link";
import { Car, IdentificationCard, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import {
  fetchFipeBrands,
  fetchFipeFicha,
  fetchFipeModels,
  fetchFipeVersions,
  fetchFipeYears,
  fetchVehicleByPlate,
  fetchVehicleProfile,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Ficha técnica do carro — NovoSeminovo",
  description: "Consulte marca, versão, ano, combustível e valor FIPE pelo modelo ou pela placa.",
};

// Ficha técnica com o que temos hoje: Tabela FIPE (marca → modelo → versão
// → ano) e, pela placa, os carros já cadastrados no NovoSeminovo. Tudo por
// GET, um passo de cada vez, sem depender de JavaScript.
type Params = { placa?: string; veiculo?: string; marca?: string; modelo?: string; versao?: string; ano?: string; anoModelo?: string };

const limpa = (v: string | undefined, max = 60) => (v ?? "").trim().slice(0, max);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">
        Passo {numero} · {titulo}
      </p>
      {children}
    </div>
  );
}

function Escolha({ name, options, keep, label }: { name: string; label: string; options: { value: string; label: string }[]; keep: Record<string, string> }) {
  return (
    <form action="/ficha-tecnica" className="flex flex-wrap gap-2">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} required className="min-w-0 flex-1 rounded-brand border border-border bg-surface-page px-3 py-2 text-ink">
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90">
        Continuar
      </button>
    </form>
  );
}

export default async function FichaTecnicaPage({ searchParams }: { searchParams: Params }) {
  const session = await auth();
  const placa = limpa(searchParams.placa, 8).toUpperCase();
  const veiculoId = /^[A-Za-z0-9_-]{1,40}$/.test(searchParams.veiculo ?? "") ? searchParams.veiculo! : "";
  const veiculo = placa
    ? await fetchVehicleByPlate(placa, session?.accessToken)
    : veiculoId
      ? await fetchVehicleProfile(veiculoId, session?.accessToken)
      : undefined;

  // Placa/veículo encontrado já preenche marca, modelo e ano.
  const marca = limpa(searchParams.marca) || veiculo?.brand || "";
  const modelo = limpa(searchParams.modelo) || veiculo?.model || "";
  const anoModelo = Number(searchParams.anoModelo) || veiculo?.yearModel || undefined;
  const versao = Number(searchParams.versao);
  const versaoOk = Number.isInteger(versao) && versao > 0 ? versao : undefined;
  const ano = /^\d{4}-\d$/.test(searchParams.ano ?? "") ? searchParams.ano! : "";

  const [marcas, modelos, versoes, anos, ficha] = await Promise.all([
    marca ? Promise.resolve([] as string[]) : fetchFipeBrands(),
    marca && !modelo ? fetchFipeModels(marca) : Promise.resolve([]),
    marca && modelo && !versaoOk ? fetchFipeVersions(marca, modelo, anoModelo) : Promise.resolve([]),
    marca && versaoOk && !ano ? fetchFipeYears(marca, versaoOk) : Promise.resolve([]),
    marca && versaoOk && ano ? fetchFipeFicha(marca, versaoOk, ano) : Promise.resolve(undefined),
  ]);
  const keep = { marca, modelo, anoModelo: anoModelo ? String(anoModelo) : "", versao: versaoOk ? String(versaoOk) : "" };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Quer conhecer a ficha técnica?</h1>
      <p className="mt-1 text-sm text-ink-muted">Busque pela placa ou escolha marca, modelo, versão e ano. Mostramos os dados da Tabela FIPE.</p>

      <section className="mt-6 rounded-brand border border-border bg-surface-raised p-4">
        <h2 className="font-display text-base font-semibold text-ink">Pela placa</h2>
        <form action="/ficha-tecnica" className="mt-3 flex gap-2">
          <input
            name="placa"
            defaultValue={placa}
            placeholder="ABC1D23"
            maxLength={8}
            className="w-44 rounded-brand border border-border bg-surface-page px-3 py-2 uppercase text-ink placeholder:text-ink-muted"
          />
          <button type="submit" className="flex items-center gap-1.5 rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90">
            <MagnifyingGlass size={16} weight="bold" /> Buscar
          </button>
        </form>
        {placa && !veiculo && (
          <p className="mt-3 text-sm text-ink-muted">
            Ainda não temos essa placa no NovoSeminovo. Escolha o modelo logo abaixo para ver a ficha.
          </p>
        )}
        {veiculo && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-brand bg-surface-sober p-3 text-sm">
            <Car size={22} weight="duotone" className="text-brand-blue" />
            <span className="font-semibold text-ink">
              {[veiculo.brand, veiculo.model, veiculo.yearModel, veiculo.color].filter(Boolean).join(" · ")}
            </span>
            <Link href={`/veiculo/${veiculo.id}`} className="ml-auto flex items-center gap-1 font-semibold text-brand-blue hover:underline">
              <IdentificationCard size={16} weight="bold" /> Ver o Diário do Carro
            </Link>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-brand border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Pelo modelo</h2>
          {marca && (
            <Link href="/ficha-tecnica" className="text-sm font-semibold text-brand-blue hover:underline">
              Recomeçar
            </Link>
          )}
        </div>
        {marca && (
          <p className="mt-1 text-sm text-ink">
            {[marca, modelo, anoModelo].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-5">
          {!marca && (
            <Passo numero={1} titulo="Marca">
              <Escolha name="marca" label="Escolha a marca" keep={{}} options={marcas.map((m) => ({ value: m, label: m }))} />
            </Passo>
          )}
          {marca && !modelo && (
            <Passo numero={2} titulo="Modelo">
              {modelos.length ? (
                <Escolha name="modelo" label="Escolha o modelo" keep={{ marca }} options={modelos.map((m) => ({ value: m.name, label: m.name }))} />
              ) : (
                <p className="text-sm text-ink-muted">Não encontramos modelos dessa marca agora. Tente de novo em instantes.</p>
              )}
            </Passo>
          )}
          {marca && modelo && !versaoOk && (
            <Passo numero={3} titulo="Versão">
              {versoes.length ? (
                <Escolha name="versao" label="Escolha a versão" keep={{ marca, modelo, anoModelo: keep.anoModelo }} options={versoes.map((v) => ({ value: String(v.code), label: v.name }))} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Não encontramos versões de {modelo} na Tabela FIPE.{" "}
                  <Link href={`/ficha-tecnica?marca=${encodeURIComponent(marca)}`} className="font-semibold text-brand-blue hover:underline">
                    Escolher outro modelo
                  </Link>
                </p>
              )}
            </Passo>
          )}
          {marca && versaoOk && !ano && (
            <Passo numero={4} titulo="Ano">
              {anos.length ? (
                <Escolha name="ano" label="Escolha o ano" keep={keep} options={anos.map((a) => ({ value: a.code, label: a.name }))} />
              ) : (
                <p className="text-sm text-ink-muted">Não encontramos os anos dessa versão agora. Tente de novo em instantes.</p>
              )}
            </Passo>
          )}
        </div>

        {ano && !ficha && <p className="mt-4 text-sm text-ink-muted">Não foi possível consultar a Tabela FIPE agora. Tente de novo em instantes.</p>}
        {ficha && (
          <div className="mt-2">
            <h3 className="font-display text-xl font-bold text-ink">{ficha.modelo}</h3>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 rounded-brand border border-border bg-surface-page p-4 sm:grid-cols-2">
              {[
                ["Marca", ficha.marca],
                ["Ano modelo", ficha.anoModelo === 32000 ? "Zero km" : String(ficha.anoModelo)],
                ["Combustível", ficha.combustivel],
                ["Código FIPE", ficha.codigoFipe],
                ["Valor FIPE", brl(ficha.valor)],
                ["Referência", ficha.mesReferencia],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-muted">{k}</dt>
                  <dd className="text-sm font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-ink-muted">
              Fonte: Tabela FIPE. O valor FIPE é uma média de mercado; o preço de cada carro depende do estado, da quilometragem e dos opcionais.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/busca?assetType=vehicle&brand=${encodeURIComponent(marca)}&model=${encodeURIComponent(modelo)}`}
                className="rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
              >
                Ver anúncios de {modelo}
              </Link>
              <Link href="/consultar-veiculo" className="rounded-brand border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sober">
                Consultar o Passaporte de um carro
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
