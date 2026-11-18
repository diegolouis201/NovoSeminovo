// Ponte entre o canal de WhatsApp (agents/whatsapp.service.ts) e os
// vendedores IA (vendedores.service.ts), sem um módulo depender do outro:
// - o WhatsApp registra como enviar uma mensagem (só com token e número);
// - os vendedores registram quem trata mensagem de empresa que AUTORIZOU o
//   WhatsApp (opt-in). Número sem autorização segue para o assistente de
//   sempre.

export type EnviarWhatsapp = (para: string, texto: string) => Promise<void>;
export type RotearWhatsapp = (de: string, texto: string, id: string) => Promise<boolean>;

let enviar: EnviarWhatsapp | undefined;
let rotear: RotearWhatsapp | undefined;

export function registrarEnvioWhatsapp(fn: EnviarWhatsapp | undefined): void {
  enviar = fn;
}
export function envioWhatsapp(): EnviarWhatsapp | undefined {
  return enviar;
}
export function registrarRotaProspeccao(fn: RotearWhatsapp | undefined): void {
  rotear = fn;
}
export async function rotearParaVendedor(de: string, texto: string, id: string): Promise<boolean> {
  if (!rotear) return false;
  try {
    return await rotear(de, texto, id);
  } catch {
    return false;
  }
}
