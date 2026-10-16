import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { fetchVehicleProfile } from "@/lib/api";
import { VehiclePassportView } from "@/components/VehiclePassport";

export default async function VehiclePassportPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { erro?: string; preset?: string };
}) {
  const session = await auth();
  const vehicle = await fetchVehicleProfile(params.id, session?.accessToken);
  if (!vehicle) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <VehiclePassportView vehicle={vehicle} erro={searchParams.erro} preset={searchParams.preset} />
    </main>
  );
}
