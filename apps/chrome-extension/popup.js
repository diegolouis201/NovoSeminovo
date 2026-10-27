// Extensão NovoSeminovo: lê o anúncio aberto na aba (o site de origem não
// bloqueia, porque é a pessoa navegando), baixa as fotos e abre a tela de
// importar do NovoSeminovo, que recebe tudo pelo entrega.js.
const SITE = "https://novoseminovo.com.br";
const MAX_PHOTOS = 20;
const MAX_CANDIDATES = 40;

const statusEl = document.getElementById("status");
const button = document.getElementById("importar");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? "error" : "";
}

// Roda dentro da página do anúncio.
function capturePage() {
  const meta = (key) =>
    document.querySelector(`meta[property="${key}"]`)?.content || document.querySelector(`meta[name="${key}"]`)?.content || "";
  const images = [];
  const push = (src) => {
    if (!src) return;
    try {
      const url = new URL(src, location.href).href;
      if (/^https?:/.test(url) && !/logo|icon|sprite|avatar|placeholder|banner|badge|favicon|\.svg(\?|$)|\.gif(\?|$)|pixel|tracking/i.test(url)) images.push(url);
    } catch (error) {
      // endereço inválido: ignora
    }
  };
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((tag) => push(tag.content));
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((tag) => tag.textContent || "");
  for (const raw of jsonLd) {
    for (const match of raw.matchAll(/https?:\/\/[^"\s]+?\.(?:jpe?g|png|webp)(?:\?[^"\s]*)?/gi)) push(match[0]);
  }
  document.querySelectorAll("img").forEach((img) => {
    const big = (img.naturalWidth || img.width || 0) >= 300 || !img.complete;
    const srcset = (img.getAttribute("srcset") || img.getAttribute("data-srcset") || "").split(",").map((part) => part.trim().split(" ")[0]).filter(Boolean);
    if (big || srcset.length) push(srcset[srcset.length - 1] || img.currentSrc || img.src || img.getAttribute("data-src"));
  });
  const metaLines = ["og:title", "og:description", "og:price:amount", "product:price:amount", "description"]
    .map((key) => (meta(key) ? `${key}: ${meta(key)}` : ""))
    .filter(Boolean);
  return {
    url: location.href,
    title: (meta("og:title") || document.title || "").slice(0, 500),
    description: (meta("og:description") || meta("description") || "").slice(0, 5000),
    structured: [...metaLines, ...jsonLd].join("\n").slice(0, 40000),
    text: (document.body?.innerText || "").slice(0, 60000),
    images: [...new Set(images)].slice(0, 80),
  };
}

// Foto → JPEG de até 1600 px (cabe no armazenamento da extensão).
async function toDataUrl(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) return undefined;
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.type.includes("svg") || blob.size < 15000) return undefined;
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width < 300 || bitmap.height < 200) return undefined;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(jpeg);
  });
}

async function run() {
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("Abra a página do anúncio e clique de novo.");
    if (new URL(tab.url).hostname.endsWith("novoseminovo.com.br")) throw new Error("Abra o anúncio no outro site (OLX, Webmotors…) e clique de novo.");
    setStatus("Lendo o anúncio…");
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage });
    if (!page || page.text.length < 100) throw new Error("Não encontramos o conteúdo do anúncio nesta página.");

    const photos = {};
    let done = 0;
    for (const url of page.images.slice(0, MAX_CANDIDATES)) {
      if (Object.keys(photos).length >= MAX_PHOTOS) break;
      setStatus(`Baixando as fotos… (${++done})`);
      try {
        const dataUrl = await toDataUrl(url);
        if (dataUrl) photos[url] = dataUrl;
      } catch (error) {
        // foto que não abre: segue sem ela
      }
    }

    await chrome.storage.local.set({ "ns-import": { page, photos, at: Date.now() } });
    setStatus(`Pronto: ${Object.keys(photos).length} foto(s). Abrindo o NovoSeminovo…`);
    await chrome.tabs.create({ url: `${SITE}/anunciar/importar?extensao=1` });
    window.close();
  } catch (error) {
    setStatus(error.message || "Não foi possível importar este anúncio.", true);
    button.disabled = false;
  }
}

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try {
    document.getElementById("host").textContent = tab?.url ? `Página aberta: ${new URL(tab.url).hostname.replace(/^www\./, "")}` : "";
  } catch (error) {
    // aba sem endereço
  }
});
button.addEventListener("click", run);
