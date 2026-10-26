import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { CepLookupFields } from "@/components/CepLookupFields";
import { EmailVerificationCard } from "@/components/EmailVerificationCard";
import { FormField, SelectField } from "@/components/FormField";
import { fetchProfile } from "@/lib/api";
import { updateProfileAction } from "@/lib/actions/profile";

const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
  { value: "undisclosed", label: "Prefiro não informar" },
];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; sucesso?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");

  const profile = await fetchProfile(session.accessToken!);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/conta" className="text-sm font-semibold text-brand-blue hover:underline">
        ← Minha conta
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Meus dados</h1>
      <p className="text-sm text-ink-muted">
        Confirme seus dados — o CPF é usado só pra viabilizar o pagamento do cashback do financiamento (Pix, ver "Meu
        cashback") e nunca é exibido publicamente.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {searchParams.error}
        </p>
      )}
      {searchParams.sucesso && (
        <p className="mt-4 rounded-brand bg-brand-green/10 px-4 py-3 text-sm font-semibold text-brand-green">
          {searchParams.sucesso}
        </p>
      )}

      {!profile ? (
        <p className="mt-8 text-ink-muted">Não foi possível carregar seus dados agora. Tente de novo em instantes.</p>
      ) : (
        <form action={updateProfileAction} className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold text-ink">Meus dados</h2>
            <FormField label="Nome completo" name="name" defaultValue={profile.name} />

            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-semibold text-ink">E-mail</p>
                <p className="text-sm text-ink-muted">{profile.email}</p>
              </div>
              <EmailVerificationCard verified={profile.emailVerified} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Gênero"
                name="gender"
                options={GENDER_OPTIONS}
                required={false}
                defaultValue={profile.gender}
              />
              <FormField
                label="Data de nascimento"
                name="birthDate"
                type="date"
                required={false}
                defaultValue={profile.birthDate}
              />
            </div>

            <FormField
              label="CPF"
              name="cpf"
              required={false}
              placeholder="000.000.000-00"
              defaultValue={profile.cpf}
            />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold text-ink">Endereço e contato</h2>
            <CepLookupFields initialZipCode={profile.zipCode} initialState={profile.state} initialCity={profile.city} />
            <FormField
              label="Telefone / WhatsApp"
              name="phone"
              type="tel"
              required={false}
              placeholder="(31) 99999-8888"
              defaultValue={profile.phone}
            />
          </section>

          <Button type="submit" className="self-start">
            Salvar alterações
          </Button>
        </form>
      )}
    </main>
  );
}
