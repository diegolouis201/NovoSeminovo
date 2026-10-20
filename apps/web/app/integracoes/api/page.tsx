import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API de integração — NovoSeminovo",
  description: "Documentação para CRMs e integradores publicarem e sincronizarem anúncios de veículos e imóveis no NovoSeminovo.",
};

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://api.novoseminovo.com.br"}/integrations/v1`;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-brand bg-ink p-4 text-xs leading-relaxed text-surface-page">
      <code>{children}</code>
    </pre>
  );
}

function H2({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-20 font-display text-xl font-semibold text-ink">
      {children}
    </h2>
  );
}

const VEHICLE_EXAMPLE = `{
  "assetType": "vehicle",
  "title": "Jeep Compass Longitude 2.0 Flex 2021",
  "description": "Único dono, revisões na concessionária, pneus novos.",
  "price": 129900,
  "city": "Belo Horizonte",
  "state": "MG",
  "neighborhood": "Buritis",
  "brand": "Jeep",
  "model": "Compass",
  "version": "Longitude 2.0",
  "yearManufacture": 2021,
  "yearModel": 2021,
  "mileage": 42000,
  "transmission": "automatic",
  "fuelType": "flex",
  "color": "Branco",
  "doors": 4,
  "plate": "ABC1D23",
  "photos": [
    "https://seu-cdn.com/fotos/compass-1.jpg",
    "https://seu-cdn.com/fotos/compass-2.jpg"
  ]
}`;

const PROPERTY_EXAMPLE = `{
  "assetType": "property",
  "title": "Apartamento 3 quartos com varanda gourmet no Sion",
  "description": "Reformado, 1 suíte, 2 vagas, prédio com elevador e portaria 24h.",
  "price": 890000,
  "city": "Belo Horizonte",
  "state": "MG",
  "neighborhood": "Sion",
  "propertyType": "apartment",
  "purpose": "sale",
  "bedrooms": 3,
  "suites": 1,
  "bathrooms": 2,
  "parkingSpots": 2,
  "areaM2": 110,
  "condoFee": 950,
  "iptu": 300,
  "features": ["gourmet_area", "elevator", "balcony", "concierge"],
  "streetAddress": "Rua Grão Pará, 500",
  "photos": ["https://seu-cdn.com/fotos/ap-1.jpg"]
}`;

export default function IntegrationApiDocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-ink">
      <p className="text-sm font-semibold text-brand-blue">Para desenvolvedores de CRM e integradores</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">API de integração NovoSeminovo</h1>
      <p className="mt-3 text-sm text-ink-muted">
        Publique, atualize e retire anúncios de veículos e imóveis de uma loja ou imobiliária no NovoSeminovo,
        automaticamente, a partir do seu sistema. A loja cria a chave de acesso no painel dela em{" "}
        <strong>Painel da loja → Integrações</strong> e passa para você.
      </p>

      <nav className="mt-6 rounded-brand border border-border bg-surface-raised p-4 text-sm">
        <p className="font-semibold">Nesta página</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {[
            ["autenticacao", "Autenticação"],
            ["conceitos", "Como funciona"],
            ["upsert", "Criar ou atualizar um anúncio"],
            ["lote", "Envio em lote"],
            ["vendido", "Marcar como vendido"],
            ["remover", "Retirar do ar"],
            ["listar", "Listar anúncios"],
            ["campos", "Campos"],
            ["feed", "Alternativa: feed (XML VRSync ou JSON)"],
            ["erros", "Erros e limites"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-brand-blue hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <H2 id="autenticacao">Autenticação</H2>
      <p className="mt-2 text-sm">
        Todas as chamadas usam HTTPS e a chave da loja no cabeçalho <code>Authorization</code>. Cada chave identifica
        uma loja/imobiliária; tudo o que for enviado com ela entra no estoque dessa loja.
      </p>
      <Code>{`Authorization: Bearer nsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Base: ${API_BASE}`}</Code>
      <p className="mt-2 text-sm">Teste a chave:</p>
      <Code>{`curl -H "Authorization: Bearer nsk_..." ${API_BASE}/me
→ { "partnerId": "...", "verified": true }`}</Code>

      <H2 id="conceitos">Como funciona</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Cada anúncio é identificado pelo <strong>código dele no seu sistema</strong> (<code>externalId</code>): letras,
          números, <code>. - _ /</code>, até 100 caracteres. Enviar de novo o mesmo código <strong>atualiza</strong> o
          anúncio — nunca duplica.
        </li>
        <li>
          A operação é idempotente: reenviar o mesmo conteúdo responde <code>&quot;unchanged&quot;</code> sem alterar nada.
          Pode reenviar o estoque inteiro periodicamente sem medo.
        </li>
        <li>
          Loja verificada: anúncios novos entram no ar na hora. Loja ainda não verificada: passam pela moderação
          (<code>status: &quot;pending_review&quot;</code>).
        </li>
        <li>
          Fotos são links públicos <code>https</code> (máx. 40, a primeira é a capa). O NovoSeminovo exibe a partir do
          seu link — mantenha-o acessível enquanto o anúncio estiver no ar. Enviar uma lista diferente substitui as fotos.
        </li>
        <li>
          Anúncio vendido (<code>sold</code>) é definitivo: novos envios com o mesmo código são ignorados
          (<code>&quot;skipped&quot;</code>).
        </li>
      </ul>

      <H2 id="upsert">Criar ou atualizar um anúncio</H2>
      <Code>{`PUT ${API_BASE}/listings/{externalId}
Content-Type: application/json

${VEHICLE_EXAMPLE}`}</Code>
      <p className="mt-2 text-sm">Resposta:</p>
      <Code>{`{ "externalId": "VEI-77", "action": "created", "listingId": "cm...", "status": "active" }
// action: created | updated | unchanged | reactivated | skipped | error (com "message")`}</Code>
      <p className="mt-3 text-sm">Imóvel — mesmo endpoint, outro corpo:</p>
      <Code>{PROPERTY_EXAMPLE}</Code>

      <H2 id="lote">Envio em lote</H2>
      <p className="mt-2 text-sm">
        Até 100 anúncios por chamada, cada um com seu <code>externalId</code>. Um item inválido não impede os outros.
      </p>
      <Code>{`POST ${API_BASE}/listings/batch
{ "listings": [ { "externalId": "VEI-77", ...campos }, { "externalId": "AP-0101", ...campos } ] }

→ { "results": [ { "externalId": "VEI-77", "action": "updated", ... }, ... ] }`}</Code>

      <H2 id="vendido">Marcar como vendido</H2>
      <Code>{`POST ${API_BASE}/listings/{externalId}/sold
{ "soldPrice": 120000 }   // opcional — valor real da venda, se diferente do anunciado`}</Code>

      <H2 id="remover">Retirar do ar</H2>
      <p className="mt-2 text-sm">
        Pausa o anúncio (não apaga). Se o mesmo código for enviado de novo depois, ele volta ao ar sozinho.
      </p>
      <Code>{`DELETE ${API_BASE}/listings/{externalId}`}</Code>

      <H2 id="listar">Listar anúncios</H2>
      <p className="mt-2 text-sm">Tudo o que veio da integração, com status e link público — útil para conciliar.</p>
      <Code>{`GET ${API_BASE}/listings
→ { "total": 2, "listings": [ { "externalId": "VEI-77", "listingId": "...", "status": "active",
     "title": "...", "price": 129900, "url": "https://novoseminovo.com.br/anuncio/...", "updatedAt": "..." } ] }`}</Code>

      <H2 id="campos">Campos</H2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-ink-muted">
              <th className="py-2 pr-3">Campo</th>
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2">Regras</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top">
            {[
              ["assetType", "texto", '"vehicle" ou "property" — obrigatório'],
              ["title", "texto", "obrigatório, mín. 5 caracteres"],
              ["description", "texto", "obrigatório, mín. 20 caracteres"],
              ["price", "número", "obrigatório, em reais (aluguel: valor mensal)"],
              ["city / state", "texto", 'obrigatórios; state = sigla, ex.: "MG"'],
              ["neighborhood", "texto", "opcional"],
              ["photos", "lista de links", "opcional, https, máx. 40, a 1ª é a capa"],
              ["— veículo —", "", ""],
              ["brand / model", "texto", "obrigatórios (ex.: Toyota / Corolla)"],
              ["version", "texto", "opcional"],
              ["yearManufacture / yearModel", "número", "obrigatórios"],
              ["mileage", "número", "obrigatório, km"],
              ["transmission", "texto", '"manual" ou "automatic"'],
              ["fuelType", "texto", '"flex", "gasoline", "ethanol", "diesel", "electric" ou "hybrid"'],
              ["color", "texto", "obrigatório"],
              ["doors", "número", "opcional, 2 a 6"],
              ["plate", "texto", "opcional — liga ao histórico (Passaporte Digital) do veículo"],
              ["— imóvel —", "", ""],
              ["propertyType", "texto", '"house", "apartment", "land", "commercial", "penthouse", "farm" ou "warehouse"'],
              ["purpose", "texto", '"sale" (venda) ou "rent" (aluguel)'],
              ["areaM2", "número", "obrigatório, área útil"],
              ["streetAddress", "texto", "obrigatório, mín. 5 caracteres (pode ser só bairro + cidade)"],
              ["bedrooms, suites, bathrooms, parkingSpots, floor", "número", "opcionais"],
              ["totalAreaM2, condoFee, iptu", "número", "opcionais; iptu mensal"],
              ["features", "lista", '"pool", "balcony", "barbecue", "elevator", "gourmet_area", "garden", "furnished", "concierge"'],
            ].map(([field, type, rule]) => (
              <tr key={field}>
                <td className="font-mono text-xs">{field}</td>
                <td>{type}</td>
                <td>{rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="feed">Alternativa: feed (XML VRSync ou JSON)</H2>
      <p className="mt-2 text-sm">
        Sem desenvolvimento: a loja cola em <strong>Integrações</strong> um link público que o seu sistema mantém
        atualizado, e o NovoSeminovo baixa periodicamente (a cada hora, ou na hora pelo botão “Sincronizar agora”). O
        feed é a lista <strong>completa</strong> do estoque: o que sumir dele é pausado aqui; se voltar, reativa.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          <strong>Imóveis — XML VRSync</strong> (o mesmo padrão enviado ao ZAP Imóveis/VivaReal): usamos{" "}
          <code>ListingID</code>, <code>Title</code>, <code>TransactionType</code>, <code>Media/Item</code>,{" "}
          <code>Details</code> (PropertyType, Description, ListPrice/RentalPrice, LivingArea/LotArea, Bedrooms,
          Bathrooms, Suites, Garage, PropertyAdministrationFee, YearlyTax, Features) e <code>Location</code> (State
          abbreviation, City, Neighborhood, Address).
        </li>
        <li>
          <strong>Veículos — catálogo Facebook/Meta (XML ou CSV/TSV)</strong>, o mesmo feed usado nos anúncios de
          estoque do Facebook/Instagram; os nomes de campo do Google Vehicle Ads também são aceitos. Usamos{" "}
          <code>vehicle_id</code> (ou <code>id</code>), <code>title</code>, <code>description</code>, <code>make</code>{" "}
          (ou <code>brand</code>), <code>model</code>, <code>trim</code>, <code>year</code>, <code>mileage.value</code>/
          <code>mileage.unit</code> (ou <code>mileage</code> “45000 km”), <code>transmission</code>,{" "}
          <code>fuel_type</code>, <code>price</code>/<code>sale_price</code>, <code>exterior_color</code>,{" "}
          <code>image[n].url</code> (ou <code>image_link</code> + <code>additional_image_link</code>),{" "}
          <code>address.city</code>/<code>address.region</code> e <code>availability</code> (vendido fica de fora).
          Sem cidade no feed, usamos a cidade onde a loja já anuncia.
        </li>
        <li>
          <strong>Veículos e imóveis — JSON</strong>: <code>{`{ "listings": [ { "externalId": "...", ...mesmos campos da API } ] }`}</code>
        </li>
        <li>Até 50 MB por feed. Feed vazio é tratado como falha e não altera nada.</li>
      </ul>

      <H2 id="erros">Erros e limites</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          <code>401</code> chave ausente, inválida ou revogada · <code>404</code> código não encontrado ·{" "}
          <code>400</code> corpo inválido · <code>429</code> limite de requisições.
        </li>
        <li>
          Validação de um anúncio não gera erro HTTP: volta <code>{`"action": "error"`}</code> com a{" "}
          <code>message</code> explicando cada campo.
        </li>
        <li>300 requisições por minuto por chave; corpo de até 5 MB; 100 anúncios por lote.</li>
        <li>O limite de anúncios do plano da loja vale também para a integração.</li>
      </ul>

      <p className="mt-10 text-sm text-ink-muted">
        Dúvidas sobre a integração? Fale com a gente pelo{" "}
        <a href="https://wa.me/5531996959679" className="font-semibold text-brand-blue hover:underline">
          WhatsApp
        </a>
        . É lojista ou corretor? Volte para o{" "}
        <Link href="/parceiro/integracoes" className="font-semibold text-brand-blue hover:underline">
          painel de integrações
        </Link>
        .
      </p>
    </main>
  );
}
