import { EventEmitter } from "node:events";

// Avisos entre módulos sem dependência circular: o ListingsService avisa e
// quem precisa (ex.: AutoModerationService) escuta.
//   "pagamento-confirmado" (listingId) — plano/destaque do anúncio pago.
export const listingEvents = new EventEmitter();
listingEvents.setMaxListeners(20);
