import { PARTNER_TRIAL_DAYS, type Objecao } from "@novoseminovo/shared-types";

// Respostas prontas para objeções (pedido do Diego, 20/11/2026). A IA pode
// adaptar o tom, nunca os fatos. Cada frase foi conferida contra o sistema
// e as que não batiam foram reescritas pelo Diego no mesmo dia:
// - #1: nada é cobrado sozinho; o aviso sai 7 dias antes do fim do grátis
//   (PartnersService.trialSweep) e, sem plano, os anúncios saem do ar.
// - #2: o cadastro não pede cartão (RegisterCompanyInputSchema); o Stripe
//   cobra no checkout, quando a empresa escolhe o plano (sem período de
//   teste na assinatura).
// - #8: etapas reais do painel (LEAD_STATUS_LABELS / LeadsKanban).
// - #9: frase dos Termos, item 7 ("não repassa o contato ... a outro anunciante").
// - #11: o selo sai da conferência do CNPJ na Receita ou da equipe.
// - #12: não há categoria de moto (FIPE só de carros).
// - #13: finalidade venda e aluguel; tipos residenciais, comercial (sala,
//   loja, galpão), terreno e rural (sítio/fazenda) em PropertyType; não
//   existe temporada. Lançamento continua com o Diego (plano sob consulta).
// Mudou o texto: suba PLAYBOOK_VERSAO (playbook-vendedor.ts).

export type PublicoRoteiro = "lojas" | "imoveis" | "todos";
export type TarefaDaResposta = "ajudar_estoque" | "ligar";
export type RespostaObjecao = { n: number; etiqueta: Objecao; publico: PublicoRoteiro; pergunta: string; resposta: string; tarefa?: TarefaDaResposta };

const MESES = Math.round(PARTNER_TRIAL_DAYS / 30);

export const RESPOSTAS_OBJECOES: readonly RespostaObjecao[] = [
  {
    n: 1,
    etiqueta: "quanto_custa",
    publico: "todos",
    pergunta: `Quanto custa depois dos ${MESES} meses? Tem multa?`,
    resposta: `Nos ${MESES} primeiros meses você não paga nada e não tem limite de anúncios. Uma semana antes de acabar, você recebe um aviso; se quiser continuar no ar, escolhe o plano (valores em novoseminovo.com.br/para-lojas). Nada é cobrado sozinho, e não tem multa nem fidelidade.`,
  },
  {
    n: 2,
    etiqueta: "cartao",
    publico: "todos",
    pergunta: "Por que pedem cartão se é grátis? / Precisa de cartão?",
    resposta: `O cadastro não pede cartão. Ele só entra quando você escolhe um plano, e aí a cobrança é feita na contratação. Nos ${MESES} meses grátis nada é cobrado.`,
  },
  {
    n: 3,
    etiqueta: "integracao",
    publico: "imoveis",
    pergunta: "Meu CRM integra?",
    resposta:
      "Se o seu CRM gera o link padrão que você já usa para publicar nos outros portais, o estoque entra por esse mesmo link. A primeira importação leva poucos minutos e depois atualiza sozinha a cada hora: imóvel novo, preço e vendido.",
  },
  {
    n: 4,
    etiqueta: "integracao",
    publico: "lojas",
    pergunta: "Meu sistema integra?",
    resposta:
      "Se a sua loja já usa o catálogo de veículos do Facebook ou do Google, o estoque entra por ele e atualiza sozinho a cada hora. Se não usa, dá para subir por planilha, vários carros de uma vez, ou a nossa equipe ajuda.",
  },
  {
    n: 5,
    etiqueta: "sem_tempo",
    publico: "todos",
    pergunta: "Não tenho CRM / não tenho tempo de cadastrar",
    resposta:
      "Sem problema. Dá para subir vários anúncios de uma vez por planilha, cadastrar pelo painel ou a nossa equipe ajuda a subir o estoque pelo WhatsApp. Quer que eu peça para alguém te chamar?",
    tarefa: "ajudar_estoque",
  },
  {
    n: 6,
    etiqueta: "audiencia",
    publico: "todos",
    pergunta: "Vocês trazem comprador? Quantos?",
    resposta: `Não vou te prometer número. O que a gente faz é colocar o seu estoque no ar e te dar a Vitrine: card e story para o Instagram e o WhatsApp e cartaz com QR para o vidro ou o portão, que levam o seu próprio público direto ao anúncio. E você acompanha cada contato no painel durante os ${MESES} meses grátis.`,
  },
  {
    n: 7,
    etiqueta: "quem_usa",
    publico: "todos",
    pergunta: "Quem já usa?",
    resposta: `Estamos começando agora, em todo o Brasil, e por isso os ${MESES} primeiros meses são grátis e sem limite: você testa sem risco e decide com o que vir no seu painel.`,
  },
  {
    n: 8,
    etiqueta: "nenhuma",
    publico: "todos",
    pergunta: "O contato chega como?",
    resposta: "Pelo chat do site e pelo WhatsApp. Cada contato vira um card no seu painel, nas etapas novo, em contato, visita, proposta, vendido ou perdido.",
  },
  {
    n: 9,
    etiqueta: "lgpd",
    publico: "todos",
    pergunta: "E os dados dos meus clientes? (LGPD)",
    resposta:
      "Ficam num servidor do NovoSeminovo no Brasil, e só a sua empresa vê os contatos. A gente não vende dados nem repassa o contato dos seus clientes a outro anunciante, e a equipe só acessa para suporte e prevenção de golpe. Se cancelar, você pode pedir a exclusão ao nosso encarregado de dados. Detalhes: novoseminovo.com.br/privacidade.",
  },
  {
    n: 10,
    etiqueta: "arquiteto",
    publico: "imoveis",
    pergunta: "O Arquiteto não engana o comprador?",
    resposta:
      "Não. É uma sugestão de reforma feita com IA, e o anúncio deixa claro que é uma ideia. O comprador vê o imóvel real nas fotos e usa o Arquiteto para imaginar o que dá para fazer.",
  },
  {
    n: 11,
    etiqueta: "nao_confia",
    publico: "todos",
    pergunta: "Golpista pode usar meu anúncio?",
    resposta: "A empresa é conferida e ganha o selo verificado. E o anúncio tem proteção: o contato não aparece na descrição e o WhatsApp só abre com login.",
  },
  {
    n: 12,
    etiqueta: "categoria_fora",
    publico: "lojas",
    pergunta: "Moto entra?",
    resposta: "Por enquanto o NovoSeminovo trabalha só com carros.",
  },
  {
    n: 13,
    // Etiqueta "categoria fora" só quando a pergunta é de temporada (ver o roteiro).
    etiqueta: "nenhuma",
    publico: "imoveis",
    pergunta: "Aluguel / temporada / rural / comercial entra?",
    resposta: "Entra sim: venda e aluguel, residencial, comercial, terreno e rural. Só temporada ainda não; posso anotar o seu interesse e te avisar se isso mudar?",
  },
  {
    n: 14,
    etiqueta: "cidade",
    publico: "todos",
    pergunta: "Atende a minha cidade?",
    resposta: "Sim, o NovoSeminovo é nacional: lojas, imobiliárias e corretores de todo o Brasil.",
  },
  {
    n: 15,
    etiqueta: "ja_anuncia",
    publico: "todos",
    pergunta: "Já anuncio em outros portais",
    resposta: `Você não precisa sair de onde está. Anuncia aqui também, sem custo por ${MESES} meses, e compara no seu painel.`,
  },
  {
    n: 16,
    etiqueta: "quer_pessoa",
    publico: "todos",
    pergunta: "Quero falar com uma pessoa / me liga",
    resposta: "Claro, vou pedir para alguém da equipe te chamar.",
    tarefa: "ligar",
  },
];

// Etiquetas que criam tarefa para uma pessoa assim que o rascunho nasce.
export const TAREFA_POR_ETIQUETA: Partial<Record<Objecao, TarefaDaResposta>> = Object.fromEntries(
  RESPOSTAS_OBJECOES.filter((r) => r.tarefa).map((r) => [r.etiqueta, r.tarefa]),
);

// Lançamento imobiliário é plano sob consulta: sempre com o Diego, mesmo que
// a IA não encaminhe (conferido no texto que a empresa escreveu).
export const PEDE_LANCAMENTO = /\b(lancamentos?|na planta|empreendimentos? (novos?|na planta))\b/;

export function respostasDoPublico(imoveis: boolean): RespostaObjecao[] {
  return RESPOSTAS_OBJECOES.filter((r) => r.publico === "todos" || r.publico === (imoveis ? "imoveis" : "lojas"));
}
