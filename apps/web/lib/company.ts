// Dados da empresa dona do NovoSeminovo — aparecem no rodapé, na Política
// de Privacidade e nos Termos (exigência do Código de Defesa do Consumidor
// pra comércio eletrônico e da Meta pra liberar o app do WhatsApp). Mudou a
// razão social? É só trocar aqui.
export const COMPANY = {
  brand: "NovoSeminovo",
  legalName: "DLRLVM SOLUCOES LTDA",
  cnpj: "60.327.011/0001-02",
  site: "novoseminovo.com.br",
  // WhatsApp Business oficial (Diego, 22/10/2026).
  whatsappDisplay: "(31) 93618-7896",
  whatsappLink: "https://wa.me/5531936187896",
  email: "diego.louis@novoseminovo.com.br",
  instagram: "https://instagram.com/novoseminovooficial",
  youtube: "https://www.youtube.com/@novoseminovo5623",
  city: "Belo Horizonte/MG",
} as const;

// Correspondente bancário parceiro — empresa separada, que atende os pedidos
// de financiamento captados pelo assistente e recebe a comissão dos bancos.
// Mesmos dados ficam em apps/api/src/agents/buyer-agent.ts (CORBAN).
export const CORBAN = {
  brand: "Ibs Capital",
  legalName: "IBS CAPITAL CORRETORA DE SEGUROS LTDA",
  cnpj: "61.452.517/0001-06",
} as const;

export const LEGAL_UPDATED_AT = "26/10/2026";

// Endereço público do site — base dos links absolutos de prévia (WhatsApp,
// Instagram, Google) e do sitemap.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://novoseminovo.com.br").replace(/\/$/, "");
