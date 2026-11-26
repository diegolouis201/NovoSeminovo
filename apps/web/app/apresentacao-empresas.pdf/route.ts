import { abrirApresentacao } from "@/lib/apresentacao/arquivo";
import { cabecalhosPdf, etagDe, naoModificado } from "@/lib/apresentacao/regras";

// https://novoseminovo.com.br/apresentacao-empresas.pdf — PDF de apresentação
// para empresas (link dos e-mails de prospecção). O arquivo fica no servidor,
// fora da imagem (DEPLOY.md, "Apresentação para empresas"): trocar o arquivo
// não pede deploy. Sem arquivo, ou arquivo que não é PDF: 404.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NAO_ACHOU = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

async function responder(request: Request, comCorpo: boolean): Promise<Response> {
  const pdf = await abrirApresentacao();
  if (!pdf) return new Response(comCorpo ? "Arquivo não encontrado." : null, { status: 404, headers: NAO_ACHOU });
  const headers = cabecalhosPdf(pdf);
  if (naoModificado(request.headers, etagDe(pdf.size, pdf.mtime), pdf.mtime)) {
    const { "Content-Length": _len, "Content-Type": _type, "Content-Disposition": _disp, ...resto } = headers;
    return new Response(null, { status: 304, headers: resto });
  }
  return new Response(comCorpo ? new Uint8Array(await pdf.ler()) : null, { status: 200, headers });
}

export function GET(request: Request) {
  return responder(request, true);
}

export function HEAD(request: Request) {
  return responder(request, false);
}
