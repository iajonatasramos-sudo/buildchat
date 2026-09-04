// Política de privacidade — exigida pela Chrome Web Store e pela LGPD.
// Descreve exatamente o que o produto faz hoje; revise com seu jurídico antes
// de vender, e ajuste os dados do controlador abaixo.

const CONTATO = 'contato@buildclinic.com.br';
const EMPRESA = 'BuildClinic';
const ATUALIZADO = '4 de setembro de 2026';

export const metadata = { title: 'Política de privacidade — BuildChat' };

export default function Privacidade() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-14">
      <div className="mb-10 flex items-center gap-2 text-[18px] font-extrabold">
        <span className="text-[20px] text-marca">⚡</span>BuildChat
      </div>

      <h1 className="mb-2 text-[30px] font-extrabold">Política de privacidade</h1>
      <p className="mb-10 text-tinta-3">Atualizada em {ATUALIZADO}.</p>

      <Secao titulo="Resumo">
        O BuildChat é uma extensão de navegador que ajuda equipes a atender pelo WhatsApp Web.
        <strong className="text-tinta"> As conversas, os áudios e os arquivos recebidos dos seus
        contatos permanecem no computador de cada usuário</strong> e não são enviados aos nossos
        servidores. Sincronizamos apenas o que a equipe cria para trabalhar: mensagens rápidas,
        pastas, anotações e preferências.
      </Secao>

      <Secao titulo="Quem é o controlador">
        {EMPRESA}, responsável pelo tratamento dos dados descritos aqui. Contato:{' '}
        <a href={`mailto:${CONTATO}`} className="font-medium text-marca">
          {CONTATO}
        </a>
        . Quando a extensão é usada por uma clínica, ela é a controladora dos dados dos próprios
        pacientes, e atuamos como operadores.
      </Secao>

      <Secao titulo="Dados que tratamos">
        <Lista
          itens={[
            ['Conta', 'nome, e-mail e senha (armazenada de forma cifrada pelo provedor de autenticação), empresa e papel.'],
            ['Mensagens rápidas', 'títulos, textos, atalhos e os arquivos que você anexa a elas (áudios, imagens, PDFs).'],
            ['Pastas e vínculos', 'nome e cor das pastas e a associação entre uma pasta e uma conversa — esta última inclui o número do WhatsApp conectado e o identificador do contato.'],
            ['Anotações', 'o texto que você escreve sobre um atendimento e o autor.'],
            ['Preferências', 'tema, caractere de atalho e endereço de webhook, quando configurado.'],
            ['Uso', 'data do último acesso de cada usuário, para o administrador acompanhar a equipe.'],
          ]}
        />
      </Secao>

      <Secao titulo="Dados que NÃO tratamos">
        <Lista
          itens={[
            ['Conversas do WhatsApp', 'mensagens trocadas com seus contatos não são enviadas nem armazenadas por nós.'],
            ['Mídia recebida', 'áudios, fotos e documentos que chegam nas conversas ficam apenas no dispositivo.'],
            ['Mensagens apagadas', 'o recurso de recuperação guarda o conteúdo somente no navegador do próprio usuário.'],
            ['Credenciais do WhatsApp', 'não temos acesso à sessão nem ao número de telefone dos seus contatos além do necessário para associar uma conversa a uma pasta.'],
          ]}
        />
      </Secao>

      <Secao titulo="Por que tratamos">
        Para prestar o serviço contratado: sincronizar o acervo da equipe entre computadores,
        controlar acesso e assentos, e dar suporte. A base legal é a execução do contrato e, quanto
        aos dados de pacientes tratados pela clínica, o legítimo interesse dela no atendimento.
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        Utilizamos a <strong className="text-tinta">Supabase</strong> como infraestrutura de banco de
        dados, autenticação e armazenamento de arquivos, com servidores na região de São Paulo.
        Não vendemos dados nem os usamos para publicidade.
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        Enquanto a conta existir. Ao encerrar a assinatura, os dados da empresa são excluídos em até
        30 dias, incluindo os arquivos enviados. Você pode pedir a exclusão antes disso pelo e-mail
        de contato.
      </Secao>

      <Secao titulo="Seus direitos">
        Conforme a LGPD, você pode solicitar acesso, correção, portabilidade ou exclusão dos seus
        dados, além de informações sobre o tratamento. Basta escrever para{' '}
        <a href={`mailto:${CONTATO}`} className="font-medium text-marca">
          {CONTATO}
        </a>
        ; respondemos em até 15 dias.
      </Secao>

      <Secao titulo="Segurança">
        Todo o tráfego é criptografado (HTTPS). O acesso aos dados é isolado por empresa no próprio
        banco, de modo que uma clínica não alcança os registros de outra. Senhas são armazenadas com
        algoritmo de hash pelo provedor de autenticação.
      </Secao>

      <Secao titulo="Armazenamento no navegador">
        A extensão guarda dados no armazenamento local do Chrome para funcionar sem internet: uma
        cópia do seu acervo, o cache das mídias já baixadas e a sua sessão. Ao sair da conta, os
        dados sincronizados são removidos do dispositivo.
      </Secao>

      <Secao titulo="Alterações" ultimo>
        Se esta política mudar de forma relevante, avisaremos pelo painel antes de a mudança valer.
      </Secao>
    </main>
  );
}

function Secao({ titulo, children, ultimo }: { titulo: string; children: React.ReactNode; ultimo?: boolean }) {
  return (
    <section className={ultimo ? '' : 'mb-8'}>
      <h2 className="mb-2 text-[17px] font-extrabold">{titulo}</h2>
      <div className="leading-relaxed text-tinta-3">{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: [string, string][] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {itens.map(([rotulo, texto]) => (
        <li key={rotulo} className="flex gap-2">
          <span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-tinta-4" />
          <span>
            <strong className="text-tinta">{rotulo}:</strong> {texto}
          </span>
        </li>
      ))}
    </ul>
  );
}
