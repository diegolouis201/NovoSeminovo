// Autorização que o cliente marca antes de os dados irem para o crédito.
// Os dados vão para a IBS Capital (parceira de crédito do NovoSeminovo), que
// atende pela Creditas (veículos) e pela Loft/Credihome (imóveis). Os textos
// seguem o que os contratos da IBS exigem (Creditas 3.1(v) e 7.8; Loft 1.6).
// Mudou o texto? Mude a versão: ela vai junto com cada pedido, como prova.

const IBS = "IBS Capital Corretora de Seguros Ltda (CNPJ 61.452.517/0001-06)";

function texto(parceiro: string, dados: string): string {
  return (
    `Autorizo o NovoSeminovo a enviar meus dados (nome, CPF, data de nascimento, telefone, e-mail) e ${dados} à ${IBS}, ` +
    `responsável pelo atendimento de crédito, e autorizo a IBS a compartilhá-los com a ${parceiro} e com outras instituições ` +
    "financeiras, fintechs e parceiros dela para simulação, análise de crédito e contato sobre a proposta. Sei que o " +
    "NovoSeminovo não é instituição financeira, que a aprovação depende de análise e que posso retirar esta autorização " +
    "quando quiser."
  );
}

export const CONSENTIMENTO_CREDITO = {
  versao: "2026-11-09",
  imovel: texto("Loft/Credihome", "os dados desta simulação"),
  veiculo: texto("Creditas", "os dados do veículo e desta simulação"),
} as const;
