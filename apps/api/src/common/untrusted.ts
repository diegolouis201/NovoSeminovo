// Prompt injection: texto escrito por usuários ou terceiros (anúncio, página
// importada, legenda) entra no prompt dentro de um bloco marcado, e o modelo é
// avisado de que ali só há dado. A marcação que vier no próprio texto é
// neutralizada, para ninguém fechar o bloco antes da hora.
export function insideTag(tag: string, text: string): string {
  const clean = text.replace(new RegExp(`<\\s*\\/?\\s*${tag}[^>]*>`, "gi"), "[marcação removida]");
  return `<${tag}>\n${clean}\n</${tag}>`;
}
