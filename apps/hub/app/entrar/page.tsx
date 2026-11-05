import { EntrarForm } from "./EntrarForm";

export const metadata = { title: "Entrar" };

export default function Entrar({ searchParams }: { searchParams: { semAcesso?: string; expirou?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="NovoSeminovo" className="mx-auto h-24 w-auto rounded-2xl bg-white p-2" />
        <h1 className="mt-6 font-display text-3xl font-semibold text-white">
          NovoSeminovo <span className="text-orange">Hub</span>
        </h1>
        <p className="mt-2 text-sm text-white/70">Entre com o e-mail e a senha da sua conta. Só a equipe liberada pelo administrador tem acesso.</p>
        {searchParams.semAcesso ? <p className="mt-4 rounded-xl bg-orange/20 p-3 text-sm text-white">Sua conta não tem acesso ao Hub. Fale com o administrador.</p> : null}
        {searchParams.expirou ? <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm text-white">Sua sessão expirou. Entre de novo.</p> : null}
        <EntrarForm />
        <a href="https://novoseminovo.com.br/esqueci-senha" className="mt-6 inline-block text-sm text-white/70 underline-offset-2 hover:underline">
          Esqueci minha senha
        </a>
      </div>
    </div>
  );
}
