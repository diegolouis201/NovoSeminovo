"use client";

import Link from "next/link";
import { Handshake, MegaphoneSimple, SealCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type Slide = {
  title: string;
  description: string;
  href: string;
  cta: string;
  bg: string;
  icon: typeof MegaphoneSimple;
};

const SLIDES: Slide[] = [
  {
    title: "Simule o financiamento sem sair do anúncio",
    description: "Veja entrada e parcelas na hora, direto na página do carro ou imóvel que você quer.",
    href: "/busca",
    cta: "Ver anúncios",
    bg: "bg-brand-blue",
    icon: SealCheck,
  },
  {
    title: "Anuncie grátis seu primeiro carro ou imóvel",
    description: "Sem enrolação: publique em minutos e converse direto com quem tem interesse.",
    href: "/anunciar",
    cta: "Anunciar agora",
    bg: "bg-brand-green",
    icon: MegaphoneSimple,
  },
  {
    title: "Seja um parceiro verificado e venda mais",
    description: "Lojas e imobiliárias com selo de verificado recebem mais contato de compradores.",
    href: "/parceiro",
    cta: "Quero ser parceiro",
    bg: "bg-brand-purple",
    icon: Handshake,
  },
];

// Troca de slide sozinha a cada 6s — pausa não é crítica aqui: são só 3
// mensagens institucionais curtas, não conteúdo que precise de tempo de
// leitura garantido.
export function PromoCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-brand-lg">
      {SLIDES.map((slide, i) => {
        const Icon = slide.icon;
        return (
          <div
            key={slide.title}
            className={`${slide.bg} ${i === active ? "relative z-10 opacity-100" : "pointer-events-none absolute inset-0 opacity-0"} flex flex-col items-start gap-3 px-6 py-10 text-white transition-opacity duration-700 md:flex-row md:items-center md:justify-between md:px-10`}
            aria-hidden={i !== active}
          >
            <div className="flex items-start gap-4 md:items-center">
              <Icon size={40} weight="duotone" className="shrink-0" />
              <div>
                <h2 className="font-display text-xl font-bold md:text-2xl">{slide.title}</h2>
                <p className="mt-1 max-w-lg text-sm text-white/90">{slide.description}</p>
              </div>
            </div>
            {/* Slides escondidos ficam por cima do visível (transparentes) — sem
                pointer-events-none o clique caía no botão do último slide. */}
            <Link
              href={slide.href}
              tabIndex={i === active ? undefined : -1}
              className="shrink-0 rounded-brand bg-white px-5 py-2.5 text-sm font-bold text-ink hover:opacity-90"
            >
              {slide.cta}
            </Link>
          </div>
        );
      })}

      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Ir pro slide ${i + 1}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>
    </div>
  );
}
