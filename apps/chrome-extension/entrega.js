// Roda na tela "Importar anúncio" do NovoSeminovo: entrega o que o popup
// capturou. A página avisa que está pronta ("ns-site:pronto") e recebe os
// dados uma vez só (depois são apagados da extensão). Como não dá para saber
// quem carrega primeiro, a extensão também avisa que chegou ("oi").
document.documentElement.dataset.nsExtensao = "1";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "ns-site" || event.data.type !== "pronto") return;
  chrome.storage.local.get("ns-import", (stored) => {
    const payload = stored["ns-import"];
    const fresh = payload && Date.now() - payload.at < 30 * 60 * 1000;
    window.postMessage({ source: "ns-extensao", type: fresh ? "anuncio" : "vazio", payload: fresh ? payload : undefined }, window.location.origin);
    if (payload) chrome.storage.local.remove("ns-import");
  });
});

window.postMessage({ source: "ns-extensao", type: "oi" }, window.location.origin);
