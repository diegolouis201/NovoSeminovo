import { MKT_REDES, MKT_TIPOS } from "@novoseminovo/shared-types";
import { Form } from "@/components/Form";
import { Cabecalho } from "@/components/ui";
import { novoConteudo } from "@/lib/actions";
import { exigirMarketing } from "@/lib/mkt";

export const metadata = { title: "Novo conteúdo" };

export default async function Novo() {
  await exigirMarketing();
  return (
    <>
      <Cabecalho titulo="Novo conteúdo" subtitulo="O normal é o Claude do Marketing criar e enviar sozinho. Use aqui quando quiser subir algo seu (ex.: foto tirada na loja). Vai para a fila de aprovação." />
      <div className="card max-w-3xl">
        <Form action={novoConteudo} botao="Enviar para aprovação" className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" className="input" defaultValue="post">
              {Object.entries(MKT_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="quando">Data e hora sugeridas</label>
            <input id="quando" name="quando" type="datetime-local" className="input" />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="label">Onde publicar</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(MKT_REDES).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="redes" value={k} defaultChecked={k === "instagram" || k === "facebook"} /> {v}</label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="titulo">Título interno</label>
            <input id="titulo" name="titulo" required maxLength={160} className="input" placeholder="Ex.: Boas-vindas Loja X" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="legenda">Legenda</label>
            <textarea id="legenda" name="legenda" rows={5} maxLength={5000} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="hashtags">Hashtags</label>
            <input id="hashtags" name="hashtags" maxLength={1000} className="input" placeholder="#carros #imoveis #novoseminovo" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="imagens">Imagens (JPEG/PNG, até 10, máx. 8 MB cada)</label>
            <input id="imagens" name="imagens" type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="links">Vídeo ou arquivo grande (link https do Drive, Dropbox...)</label>
            <input id="links" name="links" maxLength={2000} className="input" placeholder="https://drive.google.com/..." />
          </div>
        </Form>
      </div>
    </>
  );
}
