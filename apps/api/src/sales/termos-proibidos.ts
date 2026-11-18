// Único lugar da API que escreve nomes de programas encerrados e de
// parceiros que os vendedores IA NÃO podem citar (decisão do Diego). Fica
// isolado para as varreduras de texto (no-cashback.spec, sem-passaporte.spec)
// continuarem valendo para o resto do código: aqui eles só aparecem como
// proibição.
export const PROGRAMAS_ENCERRADOS = ["cashback", "Passaporte", "Diário do Carro"] as const;
export const PARCEIROS_NAO_CITAR = ["Creditas", "Loft"] as const;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const TERMOS_PROIBIDOS_REGEX = new RegExp(`\\b(${[...PROGRAMAS_ENCERRADOS, ...PARCEIROS_NAO_CITAR].map(sem).join("|")})\\b`);
