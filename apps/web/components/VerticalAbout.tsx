import Link from "next/link";
import { BookOpenText } from "@phosphor-icons/react/dist/ssr";
import { guideUrl, guidesOfTopic, type Guide } from "@/lib/guias";

// Texto próprio de /carros e /imoveis (auditoria de SEO, 21/11/2026: as duas
// eram quase iguais à página inicial) e os guias do tema. Só o que o site faz
// de verdade — conferir antes de acrescentar promessa:
// - selo de verificada: só lojas/imobiliárias conferidas pela equipe
//   (ListingCard mostra "Loja verificada" quando partnerVerified);
// - FIPE: só quando o anúncio tem o valor no cadastro (FipeReference);
// - simulação: quando o anunciante deixa ligada (financingEnabled);
// - mapa: localização aproximada, nunca o endereço exato.
const CONTENT = {
  vehicle: {
    title: "Carros seminovos e usados no NovoSeminovo",
    paragraphs: [
      "Carros anunciados por lojas e por particulares de todo o Brasil. Todo anúncio novo passa pela moderação antes de aparecer na busca, e as lojas conferidas pela nossa equipe mostram o selo de loja verificada.",
      "Quando o anúncio tem o valor da tabela FIPE no cadastro, a página mostra a comparação com o preço pedido. No próprio anúncio você conversa com o anunciante pelo chat e, quando ele deixa ligado, simula o financiamento.",
    ],
    sell: { text: "Vai vender o seu? Pessoa física anuncia grátis.", href: "/anunciar", label: "Anunciar meu carro" },
    guidesTitle: "Guias para comprar e vender carro",
    guides: [...guidesOfTopic("comprar-carro-usado").slice(0, 6), ...guidesOfTopic("vender-carro")],
  },
  property: {
    title: "Imóveis à venda e para alugar no NovoSeminovo",
    paragraphs: [
      "Casas, apartamentos, terrenos e imóveis comerciais anunciados por imobiliárias, corretores e proprietários de todo o Brasil. Na busca, os imóveis aparecem no mapa com a localização aproximada; o endereço exato você combina com o anunciante.",
      "Imobiliárias e corretores conferidos pela nossa equipe mostram o selo de verificado. No próprio anúncio você conversa com o anunciante pelo chat e, quando ele deixa ligado, simula o financiamento.",
    ],
    sell: { text: "Tem um imóvel para vender ou alugar? Pessoa física anuncia grátis.", href: "/anunciar?tipo=property", label: "Anunciar meu imóvel" },
    guidesTitle: "Guias para comprar imóvel",
    guides: guidesOfTopic("comprar-imovel").slice(0, 8),
  },
} satisfies Record<"vehicle" | "property", { title: string; paragraphs: string[]; sell: { text: string; href: string; label: string }; guidesTitle: string; guides: Guide[] }>;

export function VerticalAbout({ assetType }: { assetType: "vehicle" | "property" }) {
  const content = CONTENT[assetType];
  return (
    <section className="grid gap-8 rounded-brand-lg bg-surface-sober p-6 md:grid-cols-2 md:p-8" aria-labelledby="sobre-vertical">
      <div className="flex flex-col gap-3">
        <h2 id="sobre-vertical" className="font-display text-2xl font-semibold text-ink">
          {content.title}
        </h2>
        {content.paragraphs.map((text) => (
          <p key={text} className="text-ink-muted">
            {text}
          </p>
        ))}
        <p className="text-ink-muted">
          {content.sell.text}{" "}
          <Link href={content.sell.href} className="font-semibold text-brand-blue hover:underline">
            {content.sell.label}
          </Link>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <BookOpenText size={22} weight="duotone" className="text-brand-green" aria-hidden />
          {content.guidesTitle}
        </h2>
        <ul className="flex flex-col gap-2">
          {content.guides.map((guide) => (
            <li key={guide.id}>
              <Link href={guideUrl(guide)} className="text-sm font-semibold text-brand-blue hover:underline">
                {guide.heading}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/guia" className="text-sm font-bold text-ink hover:underline">
          Ver todos os guias
        </Link>
      </div>
    </section>
  );
}
