import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, CORBAN, DPO, PRIVACY_UPDATED_AT } from "@/lib/company";

export const metadata: Metadata = {
  title: "Política de Privacidade — NovoSeminovo",
  description: "Como o NovoSeminovo coleta, usa, compartilha e protege seus dados pessoais, conforme a LGPD.",
  alternates: { canonical: "/privacidade" },
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
      <p className="text-ink-muted">Última atualização: {PRIVACY_UPDATED_AT}</p>

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
          (opcional; nunca aparece no anúncio: guardamos só uma versão protegida para reconhecer o mesmo veículo em
          outro anúncio e procuramos borrar a placa nas fotos).
        </li>
        <li>
          <strong>Conversas:</strong> mensagens trocadas no chat com anunciantes e com o assistente virtual do site e do
          WhatsApp.
        </li>
        <li>
          <strong>Interesse em financiamento:</strong> quando você pede contato pelo assistente ou uma proposta pelo
          simulador do anúncio, nome, telefone, e-mail (se informar), valor do bem, entrada e renda mensal (se
          informar), e o registro da autorização de crédito (veja o item 5).
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
        <li>
          Encaminhar o seu pedido de simulação e de proposta de crédito, com a sua autorização (veja o item 5,
          Simulação e Financiamento).
        </li>
        <li>Moderar anúncios e prevenir fraudes (legítimo interesse).</li>
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
          <strong>Parceira de crédito:</strong> se você pedir contato sobre financiamento pelo assistente, seus dados do
          pedido são enviados à <strong>{CORBAN.legalName}</strong> ({CORBAN.brand}), CNPJ {CORBAN.cnpj}, parceira de
          crédito do {COMPANY.brand}, que fará o atendimento com bancos e financeiras e passa a ser responsável por esses
          dados nesse atendimento.
        </li>
        <li>
          <strong>Crédito imobiliário e de veículos:</strong> se você pedir uma simulação ou uma proposta de crédito e
          marcar a autorização, os seus dados vão à <strong>{CORBAN.legalName}</strong>, CNPJ {CORBAN.cnpj}, que pode
          compartilhá-los com a Loft/Credihome (imóveis), a Creditas (veículos) e instituições financeiras parceiras.
          Quem faz o quê, quais dados vão, para quê, as bases legais e como revogar estão no item 5,{" "}
          <a href="#simulacao-e-financiamento" className="font-semibold text-brand-blue hover:underline">
            Simulação e Financiamento
          </a>
          .
        </li>
        <li>
          <strong>Anunciantes:</strong> quando você conversa sobre um anúncio ou clica para chamar no WhatsApp, o
          anunciante recebe o seu contato e a mensagem e passa a ser responsável pelo atendimento e por esses dados
          (ver os{" "}
          <Link href="/termos" className="font-semibold text-brand-blue hover:underline">
            Termos de Uso
          </Link>
          , item 7). Não repassamos o seu contato a outros anunciantes.
        </li>
        <li>
          <strong>Prestadores de serviço</strong> que operam o site em nosso nome: hospedagem e armazenamento de
          fotos, envio de e-mails, processamento de pagamentos dos planos de parceiros (Stripe), modelos de IA
          (Anthropic; e Google Gemini, que recebe as fotos do anúncio para gerar as imagens do Arquiteto NovoSeminovo),
          mensagens de WhatsApp (Meta) e estatísticas de uso (Google Analytics, só com seu aceite). Alguns desses fornecedores podem tratar dados fora do Brasil, com
          as garantias exigidas pela LGPD.
        </li>
        <li>
          <strong>Meta (Facebook e Instagram), só com seu aceite dos cookies:</strong> para medir e melhorar os nossos
          anúncios, contamos à Meta quando um anúncio dela gerou um contato ou um cadastro no {COMPANY.brand}, pelo Pixel
          da Meta (no navegador) e pela API de Conversões (do nosso servidor). Vão o tipo do evento (contato ou
          cadastro), a página, o identificador do clique no anúncio, o endereço IP e o navegador, e o seu e-mail e
          telefone apenas em forma criptografada irreversível (hash SHA-256) — a Meta só consegue comparar com contas
          que ela já tem, sem ler o dado. Sem o seu aceite, nada disso é enviado. A Meta trata esses dados conforme a
          política de privacidade dela, podendo ser fora do Brasil, com as garantias exigidas pela LGPD.
        </li>
        <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
      </ul>
      <p>
        Não vendemos seus dados pessoais. Os links de lojas da lista de compras do Arquiteto podem ser links de
        afiliado: se você comprar por eles, a loja pode nos pagar uma comissão — sem custo extra para você e sem
        compartilharmos seus dados com a loja.
      </p>

      <section id="simulacao-e-financiamento" className="scroll-mt-20">
        <H2>5. Simulação e Financiamento</H2>
        <p>
          Quando você usa o simulador de crédito de um anúncio de imóvel ou de veículo e pede uma proposta, os seus
          dados passam por mais de uma empresa, e cada uma tem um papel diferente na LGPD:
        </p>
        <ul>
          <li>
            <strong>
              {COMPANY.brand} ({COMPANY.legalName}, CNPJ {COMPANY.cnpj})
            </strong>
            : é o <strong>controlador</strong> dos dados do marketplace e da sua conta (cadastro, anúncios, conversas,
            favoritos). No pedido de crédito, atua como <strong>operador</strong>, em nome da IBS Capital: recebe o seu
            pedido, transmite os dados e acompanha o andamento da solicitação, seguindo as instruções da IBS Capital.
          </li>
          <li>
            <strong>IBS Capital Corretora de Seguros Ltda. (CNPJ {CORBAN.cnpj})</strong>: é a{" "}
            <strong>controladora</strong> dos dados recebidos para o atendimento de crédito e para a intermediação da
            sua solicitação de crédito.
          </li>
          <li>
            <strong>Creditas</strong> (veículos) e <strong>Loft/Credihome</strong> (imóveis): são{" "}
            <strong>controladoras</strong> dos dados que usam para a análise de crédito, a avaliação de risco, a
            definição de taxas e condições (precificação) e a formalização do financiamento.
          </li>
          <li>
            <strong>Bancos e instituições financeiras parceiras</strong>: quando recebem os dados para analisar e
            oferecer o crédito, podem ser <strong>controladoras independentes</strong>, cada uma com a sua própria
            política de privacidade.
          </li>
        </ul>

        <p>
          <strong>Quais dados são compartilhados:</strong> dados cadastrais (nome, CPF, data de nascimento, celular e
          e-mail), dados da simulação (valor do bem, entrada, valor a financiar, prazo, uso do FGTS e quando você
          pretende comprar) e dados do bem do anúncio: do veículo (marca, modelo, versão, anos e código FIPE) ou do
          imóvel (valor do imóvel e o link do anúncio). O CPF e a data de nascimento não ficam guardados no {COMPANY.brand}:
          vão direto no pedido. Na simulação sem pedido de proposta, só os valores e a data de nascimento são
          enviados, sem dados de contato.
        </p>

        <p>
          <strong>Para que são usados:</strong> realização da simulação que você pediu, análise da possibilidade de
          concessão de crédito, apresentação de propostas e contato com você relacionado ao atendimento da sua
          solicitação.
        </p>

        <p>
          <strong>Bases legais (LGPD):</strong>
        </p>
        <ul>
          <li>
            <strong>Consentimento específico (art. 7º, I)</strong>: a autorização que você marca antes de enviar o
            pedido. A caixa vem desmarcada e o pedido só é enviado se você marcar.
          </li>
          <li>
            <strong>Procedimentos preliminares relacionados a um contrato (art. 7º, V)</strong>: a simulação e a
            proposta de financiamento que você mesmo pediu.
          </li>
          <li>
            <strong>Proteção do crédito (art. 7º, X)</strong>: somente para a consulta a birôs e cadastros de crédito
            (como o SCR do Banco Central, SPC, Serasa e BVS) e para a análise de risco.
          </li>
        </ul>

        <p>
          Guardamos o registro da sua autorização, como prova: a versão e o texto exato que você aceitou, o tipo de
          crédito (imóvel ou veículo), a data e a hora (com o fuso horário), o endereço IP e o navegador usados.
        </p>

        <p>
          <strong>Revogação:</strong> você pode revogar este consentimento a qualquer momento, sem custo, pelo e-mail do
          encarregado abaixo ou pelo WhatsApp{" "}
          <a href={COMPANY.whatsappLink} className="font-semibold text-brand-blue hover:underline">
            {COMPANY.whatsappDisplay}
          </a>
          , com o assunto “Revogação de consentimento — crédito”. A revogação vale a partir do pedido e não desfaz o
          que já foi feito antes dela com base na autorização. Sem a autorização, não conseguimos encaminhar o pedido
          de proposta, mas você continua podendo usar o simulador de parcelas e o site normalmente.
        </p>

        <p>
          <strong>Seus direitos (art. 18 da LGPD):</strong> você pode pedir, a qualquer momento:
        </p>
        <ul>
          <li>confirmação da existência de tratamento dos seus dados;</li>
          <li>acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com
            a LGPD;
          </li>
          <li>portabilidade dos dados a outro fornecedor de serviço ou produto;</li>
          <li>eliminação dos dados tratados com o seu consentimento;</li>
          <li>informação sobre o compartilhamento: com quais entidades públicas e privadas seus dados foram compartilhados;</li>
          <li>informação sobre a possibilidade de não dar o consentimento e sobre as consequências da negativa;</li>
          <li>revogação do consentimento.</li>
        </ul>

        <p>
          <strong>Encarregado pelo tratamento de dados pessoais (DPO):</strong> {DPO.name}, pelo e-mail{" "}
          <a href={`mailto:${DPO.email}`} className="font-semibold text-brand-blue hover:underline">
            {DPO.email}
          </a>
          . É o canal para exercer os seus direitos, revogar o consentimento e pedir a exclusão dos seus dados.
        </p>
      </section>

      <H2>6. Cookies e armazenamento no navegador</H2>
      <p>
        Usamos um cookie de sessão para manter você conectado e o armazenamento local do navegador para lembrar a
        conversa com o assistente e a sua escolha sobre cookies. <strong>Somente se você aceitar</strong> no aviso de
        cookies, usamos o Google Analytics (Google), que coleta dados de navegação de forma estatística — páginas
        visitadas, tempo, tipo de aparelho e região aproximada — para entendermos o uso do site. Você pode recusar sem
        prejuízo nenhum, e mudar de ideia limpando os dados do site no seu navegador. Com o mesmo aceite, usamos o
        Pixel da Meta e a API de Conversões da Meta, que guardam os cookies da Meta (_fbp e _fbc) para medir e
        melhorar os nossos anúncios no Facebook e no Instagram (ver item 4). Sem o aceite, nenhum desses é usado.
      </p>

      <H2>7. Por quanto tempo guardamos</H2>
      <p>
        Enquanto sua conta estiver ativa ou pelo tempo necessário para as finalidades acima. Dados ligados a
        pagamentos e obrigações fiscais são guardados pelo prazo exigido em lei. Pedidos de financiamento que não
        avançam são mantidos por até 2 anos para histórico de atendimento, salvo pedido de exclusão; o registro da
        autorização de crédito fica guardado junto com o pedido, como prova do consentimento.
      </p>

      <H2>8. Seus direitos</H2>
      <p>
        Você pode, a qualquer momento: confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir anonimização,
        portabilidade ou exclusão, saber com quem foram compartilhados, e revogar consentimentos (a lista completa
        do art. 18 da LGPD está no item 5). O pedido vai ao encarregado, {DPO.name}, pelo e-mail{" "}
        <a href={`mailto:${DPO.email}`} className="font-semibold text-brand-blue hover:underline">
          {DPO.email}
        </a>
        . Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <H2 id="exclusao-de-dados">9. Como pedir a exclusão dos seus dados</H2>
      <p>
        Com a conta: no site ou no app, vá em{" "}
        <Link href="/conta/excluir" className="font-semibold text-brand-blue hover:underline">
          Minha conta → Excluir minha conta
        </Link>{" "}
        e confirme com a sua senha; a exclusão é feita na hora.
      </p>
      <p>
        Sem acesso à conta: envie uma mensagem pelo WhatsApp{" "}
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

      <H2>10. Segurança</H2>
      <p>
        Usamos conexão criptografada (HTTPS), senhas criptografadas, controle de acesso por perfil e registro das ações
        de moderação. Nenhum sistema é 100% seguro; se ocorrer um incidente relevante, avisaremos os afetados e a ANPD.
      </p>

      <H2>11. Contato</H2>
      <p>
        {COMPANY.legalName} — CNPJ {COMPANY.cnpj}. Encarregado pelo tratamento de dados pessoais (DPO): {DPO.name}.
        Atendimento ao titular de dados pelo WhatsApp{" "}
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
