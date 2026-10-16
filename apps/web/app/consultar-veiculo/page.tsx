import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { fetchVehicleByPlate } from "@/lib/api";
import { VehiclePassportView } from "@/components/VehiclePassport";

export default async function ConsultarVeiculoPage({
  searchParams,
}: {
  searchParams: { placa?: string; erro?: string; preset?: string };
}) {
  const session = await auth();
  const placa = searchParams.placa?.trim();
  const vehicle = placa ? await fetchVehicleByPlate(placa, session?.accessToken) : undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Consultar Passaporte Digital</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Digite a placa de qualquer veículo pra ver o histórico registrado nesta plataforma, antes mesmo de
        falar com o vendedor.
      </p>

      <form action="/consultar-veiculo" className="mt-6 flex gap-2">
        <input
          name="placa"
          defaultValue={placa}
          placeholder="ABC1D23"
          className="w-48 rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-brand bg-brand-green px-4 py-2 text-sm font-bold text-on-green hover:opacity-90"
        >
          <MagnifyingGlass size={16} weight="bold" />
          Consultar
        </button>
      </form>

      {placa && !vehicle && (
        <p className="mt-6 rounded-brand border border-dashed border-border p-6 text-center text-sm text-ink-muted">
          Nenhum histórico encontrado pra essa placa ainda — isso não quer dizer que o carro tenha algum
          problema, só que o dono ainda não cadastrou o Passaporte Digital dele.
        </p>
      )}

      {vehicle && (
        <div className="mt-8">
          <VehiclePassportView
            vehicle={vehicle}
            erro={searchParams.erro}
            preset={searchParams.preset}
            extraParams={placa ? { placa } : undefined}
          />
        </div>
      )}
    </main>
  );
}
