import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { registerVehicleAction } from "@/lib/actions/vehicles";

export default async function RegisterVehiclePage({ searchParams }: { searchParams: { erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink">Cadastrar veículo</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Só o essencial pra começar — você edita e completa o histórico depois, aos poucos.
      </p>

      {searchParams.erro && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.erro}
        </p>
      )}

      <form action={registerVehicleAction} className="mt-6 flex flex-col gap-4">
        <FormField label="Placa" name="plate" placeholder="ABC1D23" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Marca" name="brand" placeholder="Toyota" />
          <FormField label="Modelo" name="model" placeholder="Corolla" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Ano fabricação" name="yearManufacture" type="number" min={1950} required={false} />
          <FormField label="Ano modelo" name="yearModel" type="number" min={1950} required={false} />
        </div>
        <FormField label="Cor" name="color" required={false} placeholder="Prata" />
        <Button type="submit" className="mt-2 self-start">
          Cadastrar
        </Button>
      </form>
    </main>
  );
}
