import { EstrategiaCard } from "@/components/EstrategiaForm";
import { Cabecalho } from "@/components/ui";
import { exigirMarketing, mkt } from "@/lib/mkt";

export const metadata = { title: "Estratégia por plataforma" };

const PLATS = [
  { k: "instagram", n: "Instagram", s: "IG", c: "#C13584" },
  { k: "facebook", n: "Facebook", s: "FB", c: "#1877F2" },
  { k: "tiktok", n: "TikTok", s: "TT", c: "#111111" },
  { k: "youtube", n: "YouTube Shorts", s: "YT", c: "#E62117" },
  { k: "google", n: "Google Perfil da Empresa", s: "G", c: "#34A853" },
  { k: "linkedin", n: "LinkedIn", s: "in", c: "#0A66C2" },
];

export default async function EstrategiaPage() {
  await exigirMarketing();
  const [estr, conteudos] = await Promise.all([mkt.estrategias(), mkt.listar()]);
  return (
    <>
      <Cabecalho titulo="Estratégia por plataforma" subtitulo="Objetivo, público, frequência, formatos, horário e tom de cada rede. O Claude do Marketing segue isto para montar o calendário." />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {PLATS.map((p) => {
          const e = estr.find((x) => x.plataforma === p.k) ?? { plataforma: p.k };
          const meus = conteudos.filter((c) => c.redes.includes(p.k));
          return <EstrategiaCard key={p.k} e={e} nome={p.n} sigla={p.s} cor={p.c} posts={meus.length} publicados={meus.filter((c) => c.links[p.k]).length} />;
        })}
      </div>
    </>
  );
}
