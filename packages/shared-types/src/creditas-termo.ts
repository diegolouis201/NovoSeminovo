// Termo de autorização de consulta ao SCR (Banco Central) e aos birôs de
// crédito que a Creditas exige em cada lead do Autofin C2C: o texto exato que
// a pessoa leu e aceitou vai junto, em bacenAuthorization.authorizationTerm.
// O modelo é o da documentação da Creditas; só trocamos as variáveis pelos
// dados da IBS Capital (parceira de crédito do NovoSeminovo).
//
// PENDENTE: a redação jurídica (a IBS se apresentando como "correspondente de
// instituições financeiras") ainda precisa ser confirmada pelo advogado e pela
// Creditas. Até lá o formulário fica desligado no site
// (NEXT_PUBLIC_CREDITAS_FORM diferente de "1").
//
// Mudou o texto? Mude a versão: ela fica registrada em cada pedido, como prova.

export type DadosParceiroCredito = { nomeEmpresa: string; cnpj: string; nomeFantasia: string };

export const CREDITAS_PARCEIRO: DadosParceiroCredito = {
  nomeEmpresa: "IBS CAPITAL CORRETORA DE SEGUROS LTDA",
  cnpj: "61.452.517/0001-06",
  nomeFantasia: "IBS Capital",
};

const MODELO = [
  "Eu estou ciente e autorizo, neste ato que a {NOME_EMPRESA}, correspondente de instituições financeiras nos termos da resolução CMN nº 3.954/2011, sociedade constituída e existente de acordo com as leis do Brasil e inscrita no CNPJ/MF sob o nº {CNPJ}, doravante denominada {NOME_FANTASIA}, tenha acesso e consulte de forma própria ou através de seus PARCEIROS*:",
  "a) Os meus débitos e responsabilidades decorrentes de operações com características de crédito e as informações e os registros de medidas judiciais que em meu nome constem ou venham a constar do Sistema de Informações de Crédito (SCR), gerido pelo Banco Central do Brasil BACEN, ou dos sistemas que venham a complementá-lo ou a substituí-lo.",
  "b) Informações a meu respeito constantes nos cadastros dos órgãos de proteção ao crédito tais como SPC, Serasa e BVS;",
  "AUTORIZO expressamente {NOME_FANTASIA} a divulgar, compartilhar e trocar informações a meu respeito com seus PARCEIROS* ou qualquer outro terceiro a ele ligado ou relacionado, para fins de registro, análise de risco de crédito e qualquer outra finalidade, incluindo, mas não limitado a comercialização de produtos do PARCEIROS* ou do respectivo terceiro.",
  "Estou ciente de que:",
  "a) O SCR tem por finalidades fornecer informações ao BACEN para fins de supervisão do risco de crédito a que estão expostas as instituições financeiras e propiciar o intercâmbio de informações entre essas instituições com o objetivo de subsidiar decisões de crédito e de negócios;",
  "b) poderei ter acesso aos dados constantes em meu nome no SCR por meio da Central de Atendimento ao Público do Banco Central do Brasil (CAP);",
  "c) pedidos de correções, de exclusões e de manifestações de discordância quanto às informações constantes do SCR deverão ser dirigidas ao BACEN ou à instituição responsável pela remessa das informações, por meio de requerimento escrito e fundamentado, ou, quando for o caso, pela respectiva decisão judicial;",
  "d) a consulta sobre qualquer informação ao SCR depende de minha prévia autorização;",
  "e) mais informações sobre o SCR podem ser obtidas em consulta a página na Internet do Banco Central: www.bcb.gov.br.",
].join(" ");

export function termoBacenCreditas(dados: DadosParceiroCredito = CREDITAS_PARCEIRO): string {
  return MODELO.split("{NOME_EMPRESA}")
    .join(dados.nomeEmpresa)
    .split("{CNPJ}")
    .join(dados.cnpj)
    .split("{NOME_FANTASIA}")
    .join(dados.nomeFantasia);
}

export const TERMO_BACEN_CREDITAS = {
  versao: "2026-11-13",
  texto: termoBacenCreditas(),
} as const;
