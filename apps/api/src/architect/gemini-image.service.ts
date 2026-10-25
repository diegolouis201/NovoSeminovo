import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

// Geração da imagem "depois da reforma" a partir da foto do cômodo, pelo
// Google Gemini (edição de imagem: manda a foto + instrução, volta a foto
// editada). GEMINI_API_KEY liga; GEMINI_IMAGE_MODEL troca o modelo;
// GEMINI_API_URL troca o servidor (testes).

const API_URL = process.env.GEMINI_API_URL ?? "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.5-flash-image";
const TIMEOUT_MS = 90_000;

// Regras fixas que vão junto de toda instrução — a IA de conversa escreve o
// "o quê"; isto garante que a foto continue sendo o mesmo cômodo.
const BASE_PROMPT = [
  "Edit this real-estate listing photo to show the SAME room after a renovation.",
  "Keep the exact same camera position, perspective, room size and proportions, ceiling height, windows and doors,",
  "unless the instructions below explicitly ask to change a non-structural element.",
  "Photorealistic, natural daylight, professional interior photography quality.",
  "Do not add people, text, logos or watermarks.",
  "Renovation instructions:",
].join(" ");

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };

@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);

  isEnabled(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async renovate(photo: Buffer, mimeType: string, instructions: string): Promise<{ image: Buffer; mimeType: string }> {
    return this.request(
      [{ text: `${BASE_PROMPT} ${instructions}` }, { inline_data: { mime_type: mimeType, data: photo.toString("base64") } }],
      undefined,
      "Não consegui gerar essa imagem. Tente descrever a reforma de outro jeito.",
    );
  }

  // Imagem nova só a partir de texto (fundo das artes de marketing).
  // aspectRatio: "4:5" para o feed do Instagram, "1:1", "9:16"...
  async generate(prompt: string, aspectRatio: string): Promise<{ image: Buffer; mimeType: string }> {
    return this.request([{ text: prompt }], aspectRatio, "Não consegui gerar a imagem de fundo.");
  }

  private async request(parts: GeminiPart[], aspectRatio: string | undefined, noImageMessage: string): Promise<{ image: Buffer; mimeType: string }> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ServiceUnavailableException("Geração de imagens não configurada.");
    const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
    const res = await fetch(`${API_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
      }),
    }).catch((error: Error) => {
      throw new ServiceUnavailableException(`Gerador de imagens fora do ar: ${error.message}`);
    });

    const body = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      this.logger.warn(`Gemini respondeu ${res.status}: ${body.error?.message ?? ""}`);
      // 429 = cota do Google (sem faturamento ativo, ou limite do plano) — não adianta tentar de novo já.
      throw new ServiceUnavailableException(
        res.status === 429
          ? "As imagens estão temporariamente indisponíveis (limite do serviço de imagens). Não tente de novo agora: descreva a proposta em palavras e diga que as imagens voltam em breve."
          : "O gerador de imagens recusou o pedido agora. Tente de novo em instantes.",
      );
    }
    const responseParts = body.candidates?.[0]?.content?.parts ?? [];
    for (const part of responseParts) {
      const data = part.inlineData?.data ?? part.inline_data?.data;
      if (data) return { image: Buffer.from(data, "base64"), mimeType: part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png" };
    }
    const reason = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "sem imagem na resposta";
    this.logger.warn(`Gemini não devolveu imagem: ${reason}`);
    throw new ServiceUnavailableException(noImageMessage);
  }
}
