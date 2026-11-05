import { redirect } from "next/navigation";
import { HUB_PROFILES } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { Cabecalho, Secao, Vazio } from "@/components/ui";
import { hubFetch } from "@/lib/api";
import { ativarMembro, salvarMembro } from "@/lib/actions";
import { me } from "@/lib/crm";
import { data } from "@/lib/format";

export const metadata = { title: "Equipe e acessos" };

type Membro = { userId: string; name: string; email: string; profile: string; active: boolean; since: string };

export default async function Equipe() {
  const access = await me();
  if (!access.permissions.includes("equipe")) redirect("/");
  const membros = await hubFetch<Membro[]>("/hub/equipe");
  return (
    <>
      <Cabecalho titulo="Equipe e acessos" subtitulo="Quem entra no Hub e o que cada um pode ver. Você (administrador) tem tudo." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Pessoas com acesso">
          {membros.length ? (
            <ul className="divide-y divide-line">
              {membros.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{p.name}</p>
                    <p className="text-xs text-muted">{p.email} · {HUB_PROFILES[p.profile as keyof typeof HUB_PROFILES]?.label ?? p.profile} · desde {data(p.since)}</p>
                  </div>
                  <form action={ativarMembro}>
                    <input type="hidden" name="userId" value={p.userId} />
                    <input type="hidden" name="ativo" value={p.active ? "0" : "1"} />
                    <button className={p.active ? "btn" : "btn-primary"}>{p.active ? "Tirar acesso" : "Devolver acesso"}</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Só você por enquanto" texto="Dê acesso a um funcionário ao lado." />
          )}
        </Secao>
        <Secao titulo="Dar ou mudar acesso">
          <Form action={salvarMembro} botao="Salvar acesso">
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required maxLength={200} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="nome">Nome (se ainda não tem conta no site)</label>
              <input id="nome" name="nome" maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="perfil">Perfil</label>
              <select id="perfil" name="perfil" className="input" defaultValue="comercial">
                <option value="comercial">Comercial — vê e edita o CRM (sem financeiro)</option>
                <option value="leitura">Só leitura do CRM</option>
                <option value="financeiro">Financeiro — só receitas (e o financeiro da fase 2)</option>
              </select>
            </div>
          </Form>
          <p className="mt-4 text-xs text-muted">A pessoa entra com o mesmo e-mail e senha do site. Se ainda não tem senha, ela cria em “Esqueci minha senha”. Tirar o acesso vale na hora.</p>
        </Secao>
      </div>
    </>
  );
}
