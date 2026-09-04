// Página pública: o admin manda este link para a equipe instalar a extensão.

import Link from 'next/link';

// Preencha quando a extensão estiver publicada na Chrome Web Store.
const LINK_LOJA = '';

export const metadata = { title: 'Instalar o BuildChat' };

export default function Instalar() {
  return (
    <main className="mx-auto max-w-[680px] px-6 py-14">
      <div className="mb-10 flex items-center gap-2 text-[18px] font-extrabold">
        <span className="text-[20px] text-marca">⚡</span>BuildChat
      </div>

      <h1 className="mb-2 text-[30px] font-extrabold">Instalar a extensão</h1>
      <p className="mb-8 leading-relaxed text-tinta-3">
        A extensão funciona no <strong>Google Chrome</strong>, dentro do WhatsApp Web. Leva menos de
        dois minutos.
      </p>

      {LINK_LOJA ? (
        <section className="cartao mb-6 px-6 py-6">
          <Passo n={1} titulo="Instale pela Chrome Web Store">
            <a
              href={LINK_LOJA}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-controle bg-marca px-[18px] py-[11px] text-[13.5px] font-semibold text-white transition hover:bg-marca-hover"
            >
              Adicionar ao Chrome
            </a>
          </Passo>
        </section>
      ) : (
        <section className="cartao mb-6 px-6 py-6">
          <div className="mb-4 rounded-controle border border-alerta-borda bg-alerta-fundo px-4 py-3 leading-relaxed text-alerta">
            A publicação na Chrome Web Store está em andamento. Enquanto isso, a instalação é manual
            — peça o arquivo <code className="font-mono">buildchat-extensao.zip</code> ao
            administrador da clínica.
          </div>
          <Passo n={1} titulo="Descompacte o arquivo">
            Deixe a pasta num lugar fixo do computador (ex.: Documentos). Se apagar a pasta, a
            extensão para de funcionar.
          </Passo>
          <Passo n={2} titulo="Abra as extensões do Chrome">
            Digite <code className="font-mono">chrome://extensions</code> na barra de endereços.
          </Passo>
          <Passo n={3} titulo="Ative o Modo do desenvolvedor">
            O botão fica no canto superior direito da página.
          </Passo>
          <Passo n={4} titulo="Clique em “Carregar sem compactação”">
            Selecione a pasta que você descompactou.
          </Passo>
        </section>
      )}

      <section className="cartao mb-6 px-6 py-6">
        <Passo n={LINK_LOJA ? 2 : 5} titulo="Abra o WhatsApp Web e entre na sua conta">
          Acesse <span className="font-mono">web.whatsapp.com</span>. No topo da tela aparece a barra
          do BuildChat — clique em <strong>Entrar</strong> e use o e-mail e a senha que a clínica
          cadastrou para você.
        </Passo>
        <Passo n={LINK_LOJA ? 3 : 6} titulo="Pronto" ultimo>
          Suas mensagens rápidas, pastas e anotações aparecem automaticamente, em qualquer computador
          onde você entrar com a mesma conta.
        </Passo>
      </section>

      <section className="rounded-cartao border border-borda bg-[#F0F1FB] px-5 py-4 leading-relaxed text-tinta-3">
        <strong className="text-tinta">Suas conversas continuam no seu computador.</strong> A
        extensão não envia conversas, áudios nem arquivos recebidos para nenhum servidor — sincroniza
        apenas mensagens rápidas, pastas, anotações e preferências.{' '}
        <Link href="/privacidade" className="font-medium text-marca">
          Ver a política de privacidade
        </Link>
        .
      </section>
    </main>
  );
}

function Passo({
  n,
  titulo,
  children,
  ultimo,
}: {
  n: number;
  titulo: string;
  children?: React.ReactNode;
  ultimo?: boolean;
}) {
  return (
    <div className={`flex gap-3.5 ${ultimo ? '' : 'mb-5'}`}>
      <div className="grid h-7 w-7 flex-none place-items-center rounded-controle bg-marca-suave text-[13px] font-extrabold text-marca">
        {n}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="mb-1 font-extrabold">{titulo}</div>
        <div className="leading-relaxed text-tinta-3">{children}</div>
      </div>
    </div>
  );
}
