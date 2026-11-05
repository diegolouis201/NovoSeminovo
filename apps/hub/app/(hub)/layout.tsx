import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { HubApiError } from "@/lib/api";
import { sair } from "@/lib/actions";
import { calc, feed, hoje, marcacoes, me, tarefas } from "@/lib/crm";
import { HUB_PROFILES } from "@novoseminovo/shared-types";

export const dynamic = "force-dynamic";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  if (!(await auth())) redirect("/entrar");
  let access;
  try {
    access = await me();
  } catch (e) {
    if (e instanceof HubApiError && e.status === 403) redirect("/entrar?semAcesso=1");
    throw e;
  }
  const badges: Record<string, number> = {};
  if (access.permissions.includes("crm.ver")) {
    const [f, m, t] = await Promise.all([feed(), marcacoes(), tarefas()]);
    const h = hoje();
    badges.avisos = calc.buildAlerts(f, m, [], h).filter((a: { nivel: string }) => a.nivel === "urgente").length;
    badges.regua = calc.regua(f, h, m).filter((r: { situacao: string }) => r.situacao === "atrasado").length;
    badges.tarefas = t.filter((x) => x.dueAt.slice(0, 10) <= new Date().toISOString().slice(0, 10)).length;
  }
  return (
    <div className="min-h-screen">
      <Sidebar name={access.name} profile={HUB_PROFILES[access.profile].label} permissions={access.permissions} badges={badges} sair={sair} />
      <main className="px-4 py-6 lg:ml-64 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
