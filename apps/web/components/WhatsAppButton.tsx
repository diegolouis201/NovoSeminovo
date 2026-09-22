"use client";

import { registerWhatsappClickAction } from "@/lib/actions/whatsapp";

function toWhatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function WhatsAppButton({ listingId, phone, listingTitle }: { listingId: string; phone: string; listingTitle: string }) {
  const message = `Olá! Vi o anúncio "${listingTitle}" no NovoSeminovo e queria saber mais.`;
  const href = `https://wa.me/${toWhatsappDigits(phone)}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Fogo-e-esquece: não bloqueia a navegação nem espera resposta.
        void registerWhatsappClickAction(listingId);
      }}
      className="inline-flex items-center gap-2 rounded-brand border border-border bg-transparent px-4 py-3 text-sm font-bold text-ink transition-opacity hover:opacity-90"
    >
      Chamar no WhatsApp
    </a>
  );
}
