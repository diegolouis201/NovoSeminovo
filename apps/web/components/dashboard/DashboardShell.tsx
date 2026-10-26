import type { ReactNode } from "react";
import { allowedAssetTypes, type Partner } from "@novoseminovo/shared-types";
import { auth, signOut } from "@/auth";
import { fetchMyListings, fetchMyPartner } from "@/lib/api";
import {
  DashboardSidebar,
  type NewListingOption,
  type SidebarCounter,
  type SidebarItem,
} from "@/components/dashboard/DashboardSidebar";

// Moldura do painel (/conta e /parceiro): menu lateral montado pelo tipo de
// conta — particular anuncia carro e imóvel; loja de veículos só carro;
// imobiliária e corretor só imóvel (ver PARTNER_ALLOWED_ASSET_TYPES). Sem
// sessão, não desenha nada: cada página já manda pro /entrar.

const ACCOUNT_LABEL: Record<string, string> = {
  dealership: "Loja de veículos",
  real_estate_agency: "Imobiliária",
  builder: "Construtora",
  broker: "Corretor(a)",
  workshop: "Oficina",
};

const NEW_LISTING: Record<"vehicle" | "property", NewListingOption> = {
  vehicle: { href: "/anunciar?tipo=vehicle", label: "Carro", icon: "car" },
  property: { href: "/anunciar?tipo=property", label: "Imóvel", icon: "house" },
};

function partnerItems(partner: Partner): SidebarItem[] {
  return [
    { href: "/parceiro", label: "Visão geral", icon: "gauge" },
    { href: "/parceiro/anuncios", label: "Estoque", icon: partner.type === "dealership" ? "car" : "house" },
    { href: "/parceiro/anuncios/importar", label: "Anunciar em escala", icon: "csv" },
    { href: "/parceiro/leads", label: "Leads", icon: "chart" },
    { href: "/parceiro/vendas", label: "Vendas", icon: "card" },
    { href: "/conta/mensagens", label: "Chat", icon: "chat" },
    ...(partner.type === "workshop" ? [{ href: "/parceiro/servicos", label: "Serviços", icon: "wrench" as const }] : []),
    ...(partner.isOwner
      ? [
          { href: "/parceiro/plano", label: "Plano", icon: "store" as const },
          { href: "/parceiro/equipe", label: "Equipe", icon: "team" as const },
        ]
      : []),
    { href: "/conta/recompensas", label: "Recompensas", icon: "gift" },
    { href: "/afiliado", label: "Programa de afiliados", icon: "chart" },
    { href: "/conta/notificacoes", label: "Notificações", icon: "bell" },
    { href: "/conta/perfil", label: "Meus dados", icon: "user" },
  ];
}

const PERSON_ITEMS: SidebarItem[] = [
  { href: "/conta/anuncios", label: "Meus anúncios", icon: "car" },
  { href: "/conta/mensagens", label: "Chat", icon: "chat" },
  { href: "/conta/favoritos", label: "Favoritos", icon: "heart" },
  { href: "/conta/buscas-salvas", label: "Buscas salvas", icon: "search" },
  { href: "/conta/notificacoes", label: "Notificações", icon: "bell" },
  { href: "/conta/veiculos", label: "Passaporte dos meus carros", icon: "id" },
  { href: "/conta/recompensas", label: "Recompensas", icon: "gift" },
  { href: "/afiliado", label: "Programa de afiliados", icon: "chart" },
  { href: "/conta/perfil", label: "Meus dados", icon: "user" },
  { href: "/parceiro", label: "Sou loja ou imobiliária", icon: "store" },
];

function partnerCounters(partner: Partner): SidebarCounter[] {
  const counters: SidebarCounter[] = [];
  if (partner.offline) {
    counters.push({ label: "Fora do ar", value: "Assinar", tone: "danger", href: "/parceiro/plano" });
  } else if (partner.subscription) {
    counters.push({
      label: `Plano ${partner.subscription.planName}`,
      value: `${partner.stats.activeListings}/${partner.subscription.maxActiveListings}`,
      tone: partner.subscription.status === "past_due" ? "warn" : "default",
      href: "/parceiro/plano",
    });
  } else if (partner.trialEndsAt) {
    const days = Math.max(0, Math.ceil((new Date(partner.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    counters.push({ label: "Período grátis", value: `${days} dias`, tone: days <= 7 ? "warn" : "good", href: "/parceiro/plano" });
  }
  counters.push({ label: "Anúncios no ar", value: String(partner.stats.activeListings) });
  if (partner.highlights && partner.highlights.max + partner.highlights.superMax > 0) {
    counters.push({
      label: "Destaques",
      value: `${partner.highlights.used + partner.highlights.superUsed}/${partner.highlights.max + partner.highlights.superMax}`,
      href: "/parceiro/anuncios",
    });
  }
  counters.push({ label: "Leads novos", value: String(partner.stats.leadsNew), tone: partner.stats.leadsNew ? "warn" : "default", href: "/parceiro/leads" });
  return counters;
}

export async function DashboardShell({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user || !session.accessToken) return <>{children}</>;

  const partner = await fetchMyPartner(session.accessToken);
  let items: SidebarItem[];
  let counters: SidebarCounter[];
  if (partner) {
    items = partnerItems(partner);
    counters = partnerCounters(partner);
  } else {
    const listings = await fetchMyListings(session.accessToken);
    const count = (status: string) => listings.filter((listing) => listing.status === status).length;
    items = PERSON_ITEMS;
    counters = [
      { label: "Anúncios no ar", value: String(count("active")), tone: "good", href: "/conta/anuncios" },
      { label: "Em análise", value: String(count("pending_review")), href: "/conta/anuncios" },
    ];
  }
  if (session.user.role === "admin") {
    items = [...items, { href: "/admin/anuncios", label: "Todos os anúncios", icon: "globe" }, { href: "/admin/leads", label: "Todos os leads", icon: "chart" }, { href: "/admin", label: "Administração", icon: "shield" }];
  }

  const accountLabel =
    session.user.role === "admin" ? "Administrador" : partner ? ACCOUNT_LABEL[partner.type] ?? "Parceiro" : "Particular";

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="md:mx-auto md:flex md:max-w-7xl md:gap-2">
      <DashboardSidebar
        name={partner?.legalName ?? session.user.name ?? "Minha conta"}
        accountLabel={accountLabel}
        items={items}
        counters={counters}
        newListing={allowedAssetTypes(partner?.type).map((type) => NEW_LISTING[type])}
        signOutAction={signOutAction}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
