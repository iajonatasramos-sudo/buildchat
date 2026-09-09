import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { marcaPorHost } from '@/lib/marca';
import { MarcaProvider } from './marca-cliente';

// O título e o ícone seguem o domínio: painel.anamni.com.br abre como Anamni.
export async function generateMetadata(): Promise<Metadata> {
  const marca = marcaPorHost((await headers()).get('host'));
  return {
    title: `${marca.nome} — Painel`,
    description: 'Gerencie usuários, mensagens padrão e a assinatura da sua clínica.',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const marca = marcaPorHost((await headers()).get('host'));
  return (
    // `data-marca` troca a cor da marca (ver globals.css).
    <html lang="pt-BR" data-marca={marca.id}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;800&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <MarcaProvider id={marca.id}>{children}</MarcaProvider>
      </body>
    </html>
  );
}
