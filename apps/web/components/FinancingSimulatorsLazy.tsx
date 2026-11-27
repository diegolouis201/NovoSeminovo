"use client";

import dynamic from "next/dynamic";

// Simuladores de financiamento da página do anúncio que validam no navegador
// com o contrato do shared-types (zod + contrato inteiro, ~45 KB gzip):
// Credihome só aparece em imóvel com financiamento, Creditas só quando o
// formulário está ligado. Com next/dynamic o JS deles vira um arquivo à
// parte, baixado só quando a página realmente mostra o simulador — a página
// de carro (a mais visitada) não paga por isso. O HTML continua vindo do
// servidor (ssr padrão), então nada muda na tela nem para o Google.
// O dynamic() precisa estar num componente "use client": chamado direto na
// página (Server Component) o Next não separa o arquivo.
export const CredihomeSimulator = dynamic(() => import("@/components/CredihomeSimulator").then((mod) => mod.CredihomeSimulator));
export const CreditasSimulator = dynamic(() => import("@/components/CreditasSimulator").then((mod) => mod.CreditasSimulator));
