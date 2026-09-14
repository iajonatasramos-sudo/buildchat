# 7. As duas marcas, e como separar

## Como convivem hoje

O mesmo código gera **dois produtos**. A marca é escolhida **na compilação**, nunca em tempo de
execução, e isso é importante: cada marca vira uma extensão própria na Chrome Web Store, com
identificador, ícone e armazenamento separados. Quem tem uma não vê a outra.

Tudo que distingue os dois está em **um arquivo**: `src/lib/marca.ts`.

```ts
buildchat: {
  nome: 'BuildChat',
  painelUrl: 'https://chat.buildclinic.com.br',
  dominios: ['https://app.buildclinic.com.br/*'],
  recursos: { propostas: true, transcricao: true, automacoes: true },
  etiquetasAgenda: [Follow-up, Reunião, Cobrar, Urgente],
},
anamni: {
  nome: 'Anamni',
  painelUrl: 'https://painel.anamni.com.br',
  dominios: ['https://app.buildclinic.com.br/*', 'https://*.anamni.com.br/*'],
  recursos: { propostas: false, transcricao: true, automacoes: true },
  etiquetasAgenda: [Follow-up, Consulta, Retorno, Urgente],
},
```

O resto é consequência:

- um passo da compilação reescreve o manifesto (nome, descrição, domínios liberados) e troca
  os ícones por `public/marcas/<marca>/icons/`;
- a cor sai de um atributo na raiz do CSS;
- cada marca compila na própria pasta, `dist/` e `dist-anamni/`, para uma não derrubar a outra
  no navegador;
- o painel decide a marca pelo **domínio** de quem acessa;
- a clínica guarda no banco de qual produto veio (`empresas.marca`).

```bash
npm run build          # BuildChat, em dist/
npm run build:anamni   # Anamni, em dist-anamni/
npm run pacote:tudo    # os dois .zip
```

## Para ficar só com o BuildChat

Se a decisão for levar o BuildChat para a BuildClinic e deixar o Anamni aqui, a limpeza do lado
de vocês é pequena, porque tudo está concentrado:

1. **`src/lib/marca.ts`**: apague a entrada `anamni` e o seletor de marca. Se quiser ir além,
   troque o objeto por constantes e remova a ideia de marca do código.
2. **`vite.config.ts`**: o passo que reescreve manifesto e ícones perde a razão de existir.
3. **`package.json`**: saem os comandos `:anamni` e `:tudo`.
4. **`public/marcas/`**: pasta inteira.
5. **`painel/lib/marca.ts`** e o provedor de marca: o painel passa a ter uma marca só.
6. **Banco**: a coluna `empresas.marca` pode ficar (é inofensiva) ou sair numa migração.

**Sugestão contrária, que vale considerar.** Se o plano é continuar recebendo melhorias do
Anamni, é mais barato **não remover nada**: basta compilar só o BuildChat. A estrutura de marca
existe justamente para isso, e apagar agora significa reintroduzir depois, na mão, toda vez que
algo for trazido de lá.

## O que é específico da BuildClinic dentro do produto

Um inventário honesto, para não haver surpresa:

| Item | Situação |
|---|---|
| API de proposta e transcrição | aponta para `app.buildclinic.com.br`; o token é por clínica |
| Tipos de proposta | são os produtos de arquitetura da BuildClinic (execução, interiores, vigilância) |
| Tokens visuais | vieram do protótipo do BuildClinic |
| Etiquetas da agenda | listas diferentes por marca |
| Dados de exemplo em `public/seed/` | acervo pessoal, **nunca** entra no pacote distribuído |

## Cobrança: peso morto no uso interno

Para uso interno, boa parte do sistema é dispensável: planos, assentos, teste de sete dias,
faturas, receita e a área `/sistema`. Nada disso atrapalha se ficar, mas também não precisa
ser mantido. A clínica interna pode simplesmente ficar como ativa, em um plano alto, para
sempre. É o caminho mais barato.
