import React from 'react';

export function PrivacyPolicy() {
  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', background: '#fff', minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <header style={{ borderBottom: '3px solid #be123c', paddingBottom: 16, marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, color: '#be123c', margin: 0 }}>Política de Privacidade</h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
            Amor Infinito Enxovais — Última atualização: 28 de abril de 2026
          </p>
        </header>

        <p style={{ marginBottom: 12, lineHeight: 1.7 }}>
          A <strong>Amor Infinito Enxovais</strong> respeita a sua privacidade e está comprometida com a
          proteção dos dados pessoais que você nos fornece. Esta Política de Privacidade descreve como
          coletamos, utilizamos, armazenamos e compartilhamos suas informações, em conformidade com a
          Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>

        <Section title="1. Quem Somos">
          <p>
            Amor Infinito Enxovais é uma empresa de comércio de enxovais e produtos para o lar,
            localizada em Jaboticabal/SP. Operamos um sistema interno de gestão de vendas e cobrança
            que utiliza a API do WhatsApp Business para envio de comunicações aos nossos clientes.
          </p>
        </Section>

        <Section title="2. Dados Coletados">
          <p>Coletamos as seguintes informações dos nossos clientes:</p>
          <ul>
            <li>Nome completo</li>
            <li>CPF</li>
            <li>Número de telefone (WhatsApp)</li>
            <li>Endereço completo</li>
            <li>E-mail (quando fornecido)</li>
            <li>Dados de compras e parcelas</li>
          </ul>
        </Section>

        <Section title="3. Como Usamos seus Dados">
          <p>Utilizamos seus dados exclusivamente para as seguintes finalidades:</p>
          <ul>
            <li>Cadastro e gestão do relacionamento comercial</li>
            <li>Emissão de carnês e controle de parcelas</li>
            <li>Envio de lembretes de vencimento e cobranças via WhatsApp</li>
            <li>Confirmação de pagamentos</li>
            <li>Cumprimento de obrigações legais e fiscais</li>
          </ul>
        </Section>

        <Section title="4. WhatsApp Business API">
          <p>
            Utilizamos a <strong>API oficial do WhatsApp Business (Meta)</strong> para enviar mensagens
            relacionadas à sua relação comercial conosco, como lembretes de vencimento de parcelas e
            confirmações de pagamento. Essas mensagens são enviadas somente para números que possuem
            vínculo ativo com nossa empresa.
          </p>
          <p>
            O tratamento de dados realizado pela plataforma WhatsApp é regido pela{' '}
            <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#be123c' }}>
              Política de Privacidade do WhatsApp
            </a>.
          </p>
        </Section>

        <Section title="5. Compartilhamento de Dados">
          <p>
            Não vendemos, alugamos nem compartilhamos seus dados pessoais com terceiros para fins
            comerciais. Seus dados podem ser compartilhados apenas:
          </p>
          <ul>
            <li>Com a plataforma WhatsApp Business (Meta) para envio de mensagens</li>
            <li>Com autoridades públicas, quando exigido por lei</li>
          </ul>
        </Section>

        <Section title="6. Armazenamento e Segurança">
          <p>
            Seus dados são armazenados em servidores seguros com acesso restrito a colaboradores
            autorizados. Adotamos medidas técnicas e organizacionais para proteger suas informações
            contra acesso não autorizado, perda ou destruição.
          </p>
        </Section>

        <Section title="7. Seus Direitos (LGPD)">
          <p>Em conformidade com a LGPD, você tem direito a:</p>
          <ul>
            <li>Confirmar a existência de tratamento dos seus dados</li>
            <li>Acessar seus dados pessoais</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
            <li>Solicitar a exclusão dos seus dados, quando aplicável</li>
            <li>Revogar o consentimento para envio de comunicações</li>
          </ul>
          <p>
            Para exercer qualquer um desses direitos, entre em contato pelos canais indicados na
            seção 9.
          </p>
        </Section>

        <Section title="8. Retenção de Dados">
          <p>
            Mantemos seus dados pelo período necessário para cumprimento da relação comercial e das
            obrigações legais aplicáveis. Após esse prazo, os dados são eliminados de forma segura.
          </p>
        </Section>

        <Section title="9. Contato">
          <p>
            Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus
            dados pessoais, entre em contato:
          </p>
          <ul>
            <li><strong>WhatsApp:</strong> (16) 99797-7302</li>
            <li><strong>WhatsApp:</strong> (16) 98127-1021</li>
            <li>
              <strong>E-mail:</strong>{' '}
              <a href="mailto:amorinfinitoenxovais@gmail.com" style={{ color: '#be123c' }}>
                amorinfinitoenxovais@gmail.com
              </a>
            </li>
            <li><strong>Endereço:</strong> Jaboticabal, SP — Brasil</li>
          </ul>
        </Section>

        <footer style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #ddd', fontSize: 13, color: '#888' }}>
          &copy; 2026 Amor Infinito Enxovais. Todos os direitos reservados.
        </footer>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17, color: '#be123c', marginBottom: 8 }}>{title}</h2>
      <div style={{ lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}
