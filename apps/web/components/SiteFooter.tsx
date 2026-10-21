import Link from "next/link";
import { InstagramLogo } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/Logo";
import { COMPANY, CORBAN } from "@/lib/company";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-raised">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center sm:flex-row sm:flex-wrap sm:justify-between sm:text-left">
        <Logo variant="stacked" className="text-sm" />

        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Link href="/consultar-veiculo" className="text-sm font-semibold text-brand-blue hover:underline">
            Consultar Passaporte Digital de um veículo
          </Link>
          <Link href="/recompensas" className="text-sm font-semibold text-brand-blue hover:underline">
            Programa de recompensa por financiamento
          </Link>
          <div className="flex gap-3">
            <Link href="/privacidade" className="text-sm text-ink-muted hover:underline">
              Política de Privacidade
            </Link>
            <Link href="/termos" className="text-sm text-ink-muted hover:underline">
              Termos de Uso
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-sm text-ink-muted">
            © {new Date().getFullYear()} {COMPANY.brand}
            <br />
            <span className="text-xs">
              {COMPANY.legalName} · CNPJ {COMPANY.cnpj}
            </span>
            <br />
            <span className="text-xs">
              Financiamentos: correspondente parceiro {CORBAN.brand} ({CORBAN.legalName}, CNPJ {CORBAN.cnpj})
            </span>
          </p>
          <Link
            href="https://instagram.com/novoseminovooficial"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NovoSeminovo no Instagram"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition-colors hover:border-brand-pink hover:text-brand-pink"
          >
            <InstagramLogo size={20} weight="bold" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
