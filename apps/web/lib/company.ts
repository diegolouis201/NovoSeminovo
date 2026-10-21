// Dados da empresa dona do NovoSeminovo — aparecem no rodapé, na Política
// de Privacidade e nos Termos (exigência do Código de Defesa do Consumidor
// pra comércio eletrônico e da Meta pra liberar o app do WhatsApp). Mudou a
// razão social? É só trocar aqui.
export const COMPANY = {
  brand: "NovoSeminovo",
  legalName: "DLRLVM SOLUCOES LTDA",
  cnpj: "60.327.011/0001-02",
  site: "novoseminovo.com.br",
  whatsappDisplay: "(31) 99695-9679",
  whatsappLink: "https://wa.me/5531996959679",
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

export const LEGAL_UPDATED_AT = "21/10/2026";
