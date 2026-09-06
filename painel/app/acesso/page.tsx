'use client';

// Entrada vinda da extensão: ela abre o painel com a própria sessão no
// #fragmento da URL (nunca vai ao servidor). Gravamos a sessão, apagamos o
// fragmento da barra de endereço e seguimos para a página pedida — sem
// pedir e-mail e senha de novo. Se algo falhar, cai no login normal.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function Acesso() {
  const router = useRouter();
  const params = useSearchParams();
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    (async () => {
      const para = params.get('para') ?? '/painel';
      const destino = para.startsWith('/') ? para : '/painel'; // só caminhos internos
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access_token = frag.get('at');
      const refresh_token = frag.get('rt');

      // Tira os tokens da barra de endereço antes de qualquer outra coisa.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      if (!access_token || !refresh_token) {
        // Sem tokens: talvez já esteja logado no navegador.
        const { data } = await supabase.auth.getSession();
        router.replace(data.session ? destino : '/entrar');
        return;
      }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        setFalhou(true);
        setTimeout(() => router.replace('/entrar'), 1500);
        return;
      }
      router.replace(destino);
    })();
  }, [params, router]);

  return (
    <div className="grid min-h-screen place-items-center text-tinta-3">
      {falhou ? 'Não consegui entrar com a sessão da extensão — indo para o login…' : 'Entrando…'}
    </div>
  );
}

export default function PaginaAcesso() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-tinta-3">Entrando…</div>}>
      <Acesso />
    </Suspense>
  );
}
