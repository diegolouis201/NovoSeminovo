import Link from "next/link";
import { DownloadSimple, PuzzlePiece } from "@phosphor-icons/react/dist/ssr";

export const metadata = {
  title: "Extensão do Chrome",
  description: "Traga para o NovoSeminovo o anúncio que você já tem em outro site, com texto e fotos, em um clique.",
};

// Instalação da extensão (apps/chrome-extension). Enquanto ela não está na
// Chrome Web Store, a pessoa instala o .zip em modo de desenvolvedor.
const ZIP = "/novoseminovo-extensao.zip";

export default function ExtensionPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand-blue">
        <PuzzlePiece size={16} weight="fill" />
        Extensão do Chrome
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Seu anúncio de outro site no NovoSeminovo, em um clique</h1>
      <p className="mt-2 text-ink-muted">
        Abra o seu anúncio no outro site, clique no ícone do NovoSeminovo e pronto: o texto e as
        fotos vêm para o passo a passo, no nosso padrão. Você revisa tudo antes de publicar.
      </p>

      <a
        href={ZIP}
        download
        className="mt-6 inline-flex items-center gap-2 rounded-brand bg-brand-blue px-5 py-3 text-sm font-bold text-on-blue hover:opacity-90"
      >
        <DownloadSimple size={18} weight="bold" /> Baixar a extensão (.zip)
      </a>
      <p className="mt-1 text-xs text-ink-muted">Funciona no Google Chrome e no Microsoft Edge, no computador.</p>

      <section className="mt-8 rounded-brand border border-border bg-surface-raised p-5">
        <h2 className="font-display text-xl font-semibold text-ink">Como instalar (2 minutos)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>Baixe o arquivo acima e descompacte (clique com o botão direito → &quot;Extrair tudo&quot;).</li>
          <li>
            No Chrome, digite <code className="rounded bg-surface-sober px-1">chrome://extensions</code> na barra de endereço e aperte Enter.
          </li>
          <li>Ligue o &quot;Modo do desenvolvedor&quot;, no canto de cima, à direita.</li>
          <li>Clique em &quot;Carregar sem compactação&quot; e escolha a pasta que você descompactou.</li>
          <li>Clique no ícone de quebra-cabeça do Chrome e fixe o NovoSeminovo, para ele ficar sempre à mão.</li>
        </ol>
      </section>

      <section className="mt-6 rounded-brand border border-border bg-surface-raised p-5">
        <h2 className="font-display text-xl font-semibold text-ink">Como usar</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>
            Entre na sua conta do{" "}
            <Link href="/entrar" className="font-semibold text-brand-blue hover:underline">
              NovoSeminovo
            </Link>
            .
          </li>
          <li>Abra o seu anúncio no outro site.</li>
          <li>Clique no ícone do NovoSeminovo e em &quot;Importar este anúncio&quot;.</li>
          <li>Na tela que abrir, confirme que o anúncio é seu, clique em &quot;Importar anúncio&quot; e revise antes de publicar.</li>
        </ol>
      </section>

      <p className="mt-6 rounded-brand bg-surface-sober px-4 py-3 text-xs text-ink-muted">
        A extensão só lê a página quando você clica nela, e só envia o anúncio para o NovoSeminovo. Use apenas anúncios seus ou de quem
        autorizou: as fotos e o texto são do anunciante. Telefones e links são retirados do texto.
      </p>
    </main>
  );
}
