import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, CORBAN, LEGAL_UPDATED_AT } from "@/lib/company";

export const metadata: Metadata = {
  title: "Termos de Uso — NovoSeminovo",
  description: "Regras de uso do NovoSeminovo para compradores, anunciantes e parceiros.",
};

function H2({ children }: { children: string }) {
  return <h2 className="mt-8 font-display text-xl font-semibold text-ink">{children}</h2>;
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-ink [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-semibold">Termos de Uso</h1>
      <p className="text-ink-muted">Última atualização: {LEGAL_UPDATED_AT}</p>

      <p>
        Estes termos regulam o uso do {COMPANY.brand} ({COMPANY.site}), operado por <strong>{COMPANY.legalName}</strong>
        , CNPJ {COMPANY.cnpj}. Ao criar uma conta ou usar o site, você concorda com eles e com a{" "}
        <Link href="/privacidade" className="font-semibold text-brand-blue hover:underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <H2>1. O que é o NovoSeminovo</H2>
      <p>
        Uma plataforma de anúncios de veículos e imóveis que aproxima compradores e anunciantes (pessoas físicas, lojas,
        imobiliárias e corretores). <strong>O {COMPANY.brand} não é parte das negociações</strong>: não compra, não
        vende, não intermedeia pagamentos entre comprador e vendedor e não faz corretagem de imóveis. A negociação, a
        entrega, a documentação e o pagamento do bem são de responsabilidade de comprador e anunciante.
      </p>

      <H2>2. Conta</H2>
      <ul>
        <li>Você é responsável pelas informações que fornece e pela segurança da sua senha.</li>
        <li>É proibido criar conta em nome de outra pessoa ou empresa sem autorização.</li>
      </ul>

      <H2>3. Anúncios</H2>
      <ul>
        <li>
          O anunciante garante que tem direito de vender o bem e que as informações e fotos são verdadeiras e atuais
          (preço, quilometragem, estado, documentação).
        </li>
        <li>
          Anúncios passam por moderação e podem ser recusados ou removidos se forem enganosos, ilegais, duplicados ou
          violarem estes termos. Lojas verificadas podem ter anúncios publicados sem moderação prévia, sujeitos à
          revisão posterior.
        </li>
        <li>
          Parceiros que integram o estoque pelo sistema (CRM, feed ou API) são responsáveis pelo conteúdo enviado
          automaticamente.
        </li>
      </ul>

      <H2>4. Assistente virtual e simulações</H2>
      <p>
        O assistente usa inteligência artificial e pode cometer erros. Simulações de financiamento são estimativas com
        taxas médias de mercado e <strong>não garantem aprovação de crédito, taxa ou valor de parcela</strong>, que
        dependem da análise da instituição financeira.
      </p>

      <H2>5. Financiamento</H2>
      <p>
        Quando você pede contato sobre financiamento, o atendimento é feito pela correspondente parceira{" "}
        <strong>{CORBAN.legalName}</strong> ({CORBAN.brand}), CNPJ {CORBAN.cnpj}, em nome das instituições financeiras
        que ela representa. O {COMPANY.brand} não é
        instituição financeira e não concede crédito.
      </p>

      <H2>6. Planos de parceiros e programa de recompensa</H2>
      <p>
        Planos pagos, limites de anúncios e o programa de recompensa por financiamento seguem as condições exibidas no
        painel do parceiro e na página{" "}
        <Link href="/recompensas" className="font-semibold text-brand-blue hover:underline">
          Recompensas
        </Link>
        . Recompensas são pagas apenas sobre financiamentos efetivamente concluídos e registrados.
      </p>

      <H2>7. Condutas proibidas</H2>
      <ul>
        <li>Publicar anúncio falso, de bem roubado, irregular ou que você não tem direito de vender.</li>
        <li>Usar o site para golpes, spam, coleta automatizada de dados ou assédio.</li>
        <li>Tentar burlar a segurança, a moderação ou os limites de uso do site e do assistente.</li>
      </ul>
      <p>O descumprimento pode levar à remoção de anúncios e ao bloqueio da conta.</p>

      <H2>8. Responsabilidade</H2>
      <p>
        O {COMPANY.brand} se esforça para manter o site disponível e seguro, mas não garante a veracidade de anúncios
        de terceiros nem responde pelas negociações entre usuários. Recomendamos ver o bem pessoalmente, conferir a
        documentação e nunca fazer pagamentos antecipados sem garantias.
      </p>

      <H2>9. Alterações e foro</H2>
      <p>
        Estes termos podem ser atualizados; a data acima indica a versão vigente. Fica eleito o foro da comarca de{" "}
        {COMPANY.city.split("/")[0]}, salvo o foro do domicílio do consumidor, quando aplicável.
      </p>

      <H2>10. Contato</H2>
      <p>
        WhatsApp{" "}
        <a href={COMPANY.whatsappLink} className="font-semibold text-brand-blue hover:underline">
          {COMPANY.whatsappDisplay}
        </a>
        .
      </p>
    </main>
  );
}
