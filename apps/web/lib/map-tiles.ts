// Desenho do mapa da busca de imóveis. Com MAPTILER_KEY no servidor usa o
// MapTiler (mapa mais bonito, plano grátis com limite mensal — a chave vai
// pro navegador, então restrinja a novoseminovo.com.br no painel do MapTiler);
// sem a chave, cai no OpenStreetMap padrão. Lida a cada requisição: trocar a
// chave no .env só pede reiniciar o web, sem remontar.
export type MapTiles = { url: string; attribution: string };

const OSM: MapTiles = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
};

export function mapTiles(): MapTiles {
  const key = process.env.MAPTILER_KEY?.trim();
  if (!key) return OSM;
  const style = process.env.MAPTILER_STYLE?.trim() || "streets-v2";
  return {
    url: `https://api.maptiler.com/maps/${encodeURIComponent(style)}/256/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
    attribution:
      '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
  };
}
