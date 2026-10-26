import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, CORBAN, LEGAL_UPDATED_AT } from "@/lib/company";

export const metadata: Metadata = {
  title: "Política de Privacidade — NovoSeminovo",
  description: "Como o NovoSeminovo coleta, usa, compartilha e protege seus dados pessoais, conforme a LGPD.",
};

function H2({ id, children }: { id?: string; children: string }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-20 font-display text-xl font-semibold text-ink">
      {children}
    </h2>
  );
}

// Texto descreve o que o sistema realmente faz (ver HANDOFF.md) — ao
// adicionar coleta de dado novo, integração ou parceiro que recebe dados,
// atualizar aqui e a data em lib/company.ts.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-ink [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="font-display text-3xl font-semibold">Política de Privacidade</h1>
      <p className="text-ink-muted">Última atualização: {LEGAL_UPDATED_AT}</p>

      <p>
        O {COMPANY.brand} ({COMPANY.site}) é operado por <strong>{COMPANY.legalName}</strong>, CNPJ {COMPANY.cnpj}, com
        sede em {COMPANY.city} (“nós”). Esta política explica quais dados pessoais tratamos, para quê, com quem
        compartilhamos e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).
      </p>

      <H2>1. Dados que coletamos</H2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, senha (guardada de forma criptografada, nunca em texto) e, se você
          informar, telefone.
        </li>
        <li>
          <strong>CPF:</strong> obrigatório no cadastro, para garantir uma conta por pessoa e prevenir fraudes. Nunca
          aparece no site nem é mostrado a outros usuários.
        </li>
        <li>
          <strong>Perfil (opcional):</strong> data de nascimento, gênero, CEP, cidade e estado.
        </li>
        <li>
          <strong>Anúncios:</strong> dados do veículo ou imóvel, fotos, localização aproximada e, para veículos, a placa
          (usada no histórico do veículo — “Passaporte Digital”).
        </li>
        <li>
          <strong>Conversas:</strong> mensagens trocadas no chat com anunciantes e com o assistente virtual do site e do
          WhatsApp.
        </li>
        <li>
          <strong>Interesse em financiamento:</strong> quando você pede contato pelo assistente, nome, telefone, e-mail (se
          informar), valor do bem, entrada e renda mensal (se informar).
        </li>
        <li>
          <strong>Lojas, imobiliárias e corretores parceiros:</strong> razão social, CNPJ/documento, endereço, logo,
          equipe, estoque, leads e vendas registradas no painel.
        </li>
        <li>
          <strong>Uso do site:</strong> anúncios favoritados, buscas salvas, notificações, contagem de visualizações de
          anúncios e cliques em “Chamar no WhatsApp”.
        </li>
        <li>
          <strong>Arquiteto NovoSeminovo:</strong> a conversa sobre a reforma, as imagens geradas e a lista de compras
          ficam salvas na sua conta; contamos os cliques nos links de lojas da lista.
        </li>
      </ul>

      <H2>2. Para que usamos</H2>
      <ul>
        <li>Criar e manter sua conta e publicar seus anúncios (execução de contrato).</li>
        <li>Conectar compradores e anunciantes, inclusive avisando o anunciante quando alguém demonstra interesse.</li>
        <li>
          Atender você pelo assistente virtual: buscar anúncios, simular financiamento e, <strong>somente com sua
          autorização na conversa</strong>, encaminhar seu pedido a um especialista em financiamento.
        </li>
        <li>Moderar anúncios e prevenir fraudes (legítimo interesse).</li>
        <li>Calcular e pagar o cashback do financiamento a quem contratou, por Pix no CPF (execução de contrato).</li>
        <li>Cumprir obrigações legais e fiscais.</li>
      </ul>

      <H2>3. Assistente virtual com inteligência artificial</H2>
      <p>
        O assistente do site, do painel e do WhatsApp usa modelos de IA da <strong>Anthropic</strong> (Claude), que
        processam o texto das conversas para gerar as respostas. As conversas ficam guardadas no {COMPANY.brand} para
        dar continuidade ao atendimento. Respostas geradas por IA podem conter erros, e simulações de financiamento são
        estimativas, sem garantia de aprovação. Não informe senhas, dados bancários ou documentos no chat — o
        assistente nunca pede isso.
      </p>

      <H2>4. Com quem compartilhamos</H2>
      <ul>
        <li>
          <strong>Correspondente bancário parceiro:</strong> se você pedir contato sobre financiamento, seus dados do
          pedido são enviados à <strong>{CORBAN.legalName}</strong> ({CORBAN.brand}), CNPJ {CORBAN.cnpj}, correspondente
          parceira do {COMPANY.brand}, que fará o atendimento e a análise com bancos e financeiras e passa a ser
          responsável por esses dados nesse atendimento.
        </li>
        <li>
          <strong>Credihome (Loft), plataforma de crédito imobiliário:</strong> se você pedir uma proposta no simulador
          de crédito de um imóvel e autorizar, enviamos nome, CPF, data de nascimento, celular, e-mail e os valores da
          simulação à Credihome, que compara os bancos, faz a análise de crédito e entra em contato com você. O CPF e a
          data de nascimento não ficam guardados no {COMPANY.brand}. Na simulação sem pedido de proposta, só os valores e
          a data de nascimento são enviados, sem dados de contato.
        </li>
        <li>
          <strong>Anunciantes:</strong> quando você conversa sobre um anúncio ou clica para chamar no WhatsApp, o
          anunciante recebe o seu contato e a mensagem.
        </li>
        <li>
          <strong>Prestadores de serviço</strong> que operam o site em nosso nome: hospedagem e armazenamento de
          fotos, envio de e-mails, processamento de pagamentos dos planos de parceiros (Stripe), modelos de IA
          (Anthropic; e Google Gemini, que recebe as fotos do anúncio para gerar as imagens do Arquiteto NovoSeminovo),
          mensagens de WhatsApp (Meta) e estatísticas de uso (Google Analytics, só com seu aceite). Alguns desses fornecedores podem tratar dados fora do Brasil, com
          as garantias exigidas pela LGPD.
        </li>
        <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
      </ul>
      <p>
        Não vendemos seus dados pessoais. Os links de lojas da lista de compras do Arquiteto podem ser links de
        afiliado: se você comprar por eles, a loja pode nos pagar uma comissão — sem custo extra para você e sem
        compartilharmos seus dados com a loja.
      </p>

      <H2>5. Cookies e armazenamento no navegador</H2>
      <p>
        Usamos um cookie de sessão para manter você conectado e o armazenamento local do navegador para lembrar a
        conversa com o assistente e a sua escolha sobre cookies. <strong>Somente se você aceitar</strong> no aviso de
        cookies, usamos o Google Analytics (Google), que coleta dados de navegação de forma estatística — páginas
        visitadas, tempo, tipo de aparelho e região aproximada — para entendermos o uso do site. Você pode recusar sem
        prejuízo nenhum, e mudar de ideia limpando os dados do site no seu navegador. Não usamos cookies de
        publicidade.
      </p>

      <H2>6. Por quanto tempo guardamos</H2>
      <p>
        Enquanto sua conta estiver ativa ou pelo tempo necessário para as finalidades acima. Dados ligados a
        pagamentos e obrigações fiscais são guardados pelo prazo exigido em lei. Pedidos de financiamento que não
        avançam são mantidos por até 2 anos para histórico de atendimento, salvo pedido de exclusão.
      </p>

      <H2>7. Seus direitos</H2>
      <p>
        Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir anonimização,
        portabilidade ou exclusão, saber com quem foram compartilhados, e revogar consentimentos. Também pode
        reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <H2 id="exclusao-de-dados">8. Como pedir a exclusão dos seus dados</H2>
      <p>
        Envie uma mensagem pelo WhatsApp{" "}
        <a href={COMPANY.whatsappLink} className="font-semibold text-brand-blue hover:underline">
          {COMPANY.whatsappDisplay}
        </a>{" "}
        ou pelo e-mail{" "}
        <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand-blue hover:underline">
          {COMPANY.email}
        </a>{" "}
        com o assunto “Exclusão de dados”, informando o e-mail da conta ou o telefone usado no atendimento. Isso vale
        também para conversas feitas com o assistente pelo WhatsApp. Respondemos em até 15 dias e confirmamos quando a
        exclusão for concluída (exceto dados que a lei nos obriga a manter).
      </p>

      <H2>9. Segurança</H2>
      <p>
        Usamos conexão criptografada (HTTPS), senhas criptografadas, controle de acesso por perfil e registro das ações
        de moderação. Nenhum sistema é 100% seguro; se ocorrer um incidente relevante, avisaremos os afetados e a ANPD.
      </p>

      <H2>10. Contato</H2>
      <p>
        {COMPANY.legalName} — CNPJ {COMPANY.cnpj}. Atendimento ao titular de dados pelo WhatsApp{" "}
        <a href={COMPANY.whatsappLink} className="font-semibold text-brand-blue hover:underline">
          {COMPANY.whatsappDisplay}
        </a>{" "}
        ou pelo e-mail{" "}
        <a href={`mailto:${COMPANY.email}`} className="font-semibold text-brand-blue hover:underline">
          {COMPANY.email}
        </a>
        . Veja também os{" "}
        <Link href="/termos" className="font-semibold text-brand-blue hover:underline">
          Termos de Uso
        </Link>
        .
      </p>
    </main>
  );
}
