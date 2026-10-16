import Link from "next/link";
import { redirect } from "next/navigation";
import { Car, Plus } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { fetchMyVehicles } from "@/lib/api";

export default async function MyVehiclesPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const vehicles = await fetchMyVehicles(session.accessToken);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Meus veículos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            O Passaporte Digital de cada carro — registre o histórico agora, não só na hora de vender.
          </p>
        </div>
        <Link
          href="/conta/veiculos/novo"
          className="flex shrink-0 items-center gap-1.5 rounded-brand bg-brand-green px-4 py-2.5 text-sm font-bold text-on-green hover:opacity-90"
        >
          <Plus size={16} weight="bold" />
          Cadastrar veículo
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {vehicles.map((vehicle) => (
          <Link
            key={vehicle.id}
            href={`/veiculo/${vehicle.id}`}
            className="flex items-center gap-4 rounded-brand border border-border bg-surface-raised p-4 hover:bg-surface-sober"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-sober">
              <Car size={22} weight="duotone" className="text-brand-blue" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-ink">
                {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
                {vehicle.yearModel ? ` ${vehicle.yearModel}` : ""}
              </p>
              <p className="text-xs text-ink-muted">
                {vehicle.plateMasked ? `Placa ${vehicle.plateMasked} · ` : ""}
                {vehicle.events.length} evento{vehicle.events.length === 1 ? "" : "s"} no histórico
              </p>
            </div>
          </Link>
        ))}
        {vehicles.length === 0 && (
          <p className="rounded-brand border border-dashed border-border p-6 text-center text-sm text-ink-muted">
            Você ainda não cadastrou nenhum veículo. Comece agora pra construir o histórico dele ao longo do
            tempo — isso agrega valor na hora de vender.
          </p>
        )}
      </div>

      <Link href="/consultar-veiculo" className="mt-8 block text-sm font-semibold text-brand-blue hover:underline">
        Ou consulte o histórico de outro veículo pela placa →
      </Link>
    </main>
  );
}
