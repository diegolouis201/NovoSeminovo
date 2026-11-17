// Autorização que o cliente marca antes de os dados irem para o crédito.
// Os dados vão para a IBS Capital (parceira de crédito do NovoSeminovo), que
// atende pela Creditas (veículos) e pela Loft/Credihome (imóveis).
//
// Desde o parecer jurídico LGPD de 17/11/2026 (item 3.1), os textos são os
// do advogado, PALAVRA POR PALAVRA, um por modalidade, cada um com a sua
// versão. O "[Política de Privacidade]" do parecer vira o link para
// /privacidade no fim do texto (LINK_POLITICA_PRIVACIDADE).
//
// REGRA: nunca edite um texto que já foi ao ar. Mudou o texto? Crie uma
// versão nova em CONSENTIMENTO_CREDITO_HISTORICO e aponte CONSENTIMENTO_CREDITO
// para ela. Cada aceite guarda a versão (e uma cópia do texto) como prova, e
// o texto exato de toda versão precisa continuar recuperável aqui
// (item 2.1.4 ii do parecer). O teste prende os textos antigos por hash.

export type ModalidadeCredito = "imovel" | "veiculo";
export type ProdutoCredito = "credihome" | "creditas";

export type VersaoConsentimentoCredito = {
  versao: string;
  modalidade: ModalidadeCredito;
  produto: ProdutoCredito;
  // Data em que a versão entrou no ar (AAAA-MM-DD, horário de Brasília).
  vigenteDesde: string;
  texto: string;
};

export const LINK_POLITICA_PRIVACIDADE = { texto: "Política de Privacidade", href: "/privacidade" } as const;

// ---- Versão de 09/11/2026 (antes do parecer). NÃO EDITAR. ----
const IBS_2026_11_09 = "IBS Capital Corretora de Seguros Ltda (CNPJ 61.452.517/0001-06)";
function texto20261109(parceiro: string, dados: string): string {
  return (
    `Autorizo o NovoSeminovo a enviar meus dados (nome, CPF, data de nascimento, telefone, e-mail) e ${dados} à ${IBS_2026_11_09}, ` +
    `responsável pelo atendimento de crédito, e autorizo a IBS a compartilhá-los com a ${parceiro} e com outras instituições ` +
    "financeiras, fintechs e parceiros dela para simulação, análise de crédito e contato sobre a proposta. Sei que o " +
    "NovoSeminovo não é instituição financeira, que a aprovação depende de análise e que posso retirar esta autorização " +
    "quando quiser."
  );
}

// ---- Versões do parecer jurídico LGPD de 17/11/2026 (item 3.1). NÃO EDITAR. ----
const IMOVEL_2026_11_17 =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e de simulação à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), empresa parceira responsável pelo atendimento de crédito e pela intermediação da solicitação de crédito, e autorizo a IBS a compartilhá-los com a Loft/Credihome e instituições financeiras parceiras para realização da simulação solicitada, análise da possibilidade de concessão de crédito e contato relacionado ao atendimento da solicitação. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";
const VEICULO_2026_11_17 =
  "Autorizo o NovoSeminovo a encaminhar meus dados cadastrais e do veículo à IBS Capital Corretora de Seguros Ltda. (CNPJ 61.452.517/0001-06), parceira responsável pelo atendimento de crédito, e autorizo a IBS a compartilhá-los com a Creditas e financeiras parceiras para fins de simulação, análise de crédito e propostas. Declaro ciência de que posso revogar este consentimento a qualquer momento. Política de Privacidade";

export const CONSENTIMENTO_CREDITO_HISTORICO: readonly VersaoConsentimentoCredito[] = [
  {
    versao: "2026-11-09",
    modalidade: "imovel",
    produto: "credihome",
    vigenteDesde: "2026-11-09",
    texto: texto20261109("Loft/Credihome", "os dados desta simulação"),
  },
  {
    versao: "2026-11-09",
    modalidade: "veiculo",
    produto: "creditas",
    vigenteDesde: "2026-11-09",
    texto: texto20261109("Creditas", "os dados do veículo e desta simulação"),
  },
  { versao: "2026-11-17-parecer-imovel", modalidade: "imovel", produto: "credihome", vigenteDesde: "2026-11-17", texto: IMOVEL_2026_11_17 },
  { versao: "2026-11-17-parecer-veiculo", modalidade: "veiculo", produto: "creditas", vigenteDesde: "2026-11-17", texto: VEICULO_2026_11_17 },
];

function versaoAtual(versao: string, modalidade: ModalidadeCredito): VersaoConsentimentoCredito {
  const encontrada = CONSENTIMENTO_CREDITO_HISTORICO.find((item) => item.versao === versao && item.modalidade === modalidade);
  if (!encontrada) throw new Error(`Versão de consentimento ${versao} (${modalidade}) não existe no histórico`);
  return encontrada;
}

// Versões em vigor: as que o site mostra e que a API aceita.
export const CONSENTIMENTO_CREDITO = {
  imovel: versaoAtual("2026-11-17-parecer-imovel", "imovel"),
  veiculo: versaoAtual("2026-11-17-parecer-veiculo", "veiculo"),
} as const;

export function consentimentoCreditoDaVersao(versao: string, modalidade: ModalidadeCredito): VersaoConsentimentoCredito | undefined {
  return CONSENTIMENTO_CREDITO_HISTORICO.find((item) => item.versao === versao && item.modalidade === modalidade);
}

// Texto exato de uma versão (para auditoria); undefined se não existe.
export function textoConsentimentoCredito(versao: string, modalidade: ModalidadeCredito): string | undefined {
  return consentimentoCreditoDaVersao(versao, modalidade)?.texto;
}
