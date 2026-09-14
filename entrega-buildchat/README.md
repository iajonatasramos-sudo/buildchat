# Entrega do BuildChat

Esta pasta reúne tudo que é preciso para **continuar o BuildChat dentro da BuildClinic**,
sem depender deste repositório nem de quem o escreveu.

O BuildChat é uma **extensão do Chrome** que roda dentro do WhatsApp Web e acrescenta
mensagens rápidas, pastas, anotações, agenda, propostas, transcrição de áudio, automações e
um CRM leve. Hoje ela conversa com um servidor Supabase e com um painel web próprio.

**O que muda daqui para a frente**

- **BuildChat** (uso interno do grupo BuildClinic) passa a ser tocado do lado da BuildClinic.
- **Anamni** (o mesmo produto, vendido para dentistas e médicos) continua neste repositório.

As duas marcas saem hoje do mesmo código, com nome, ícone, cor, painel e lista de recursos
próprios. A pasta [07-marca-e-build.md](07-marca-e-build.md) explica como separar.

---

## Por onde começar

Leia nesta ordem. São documentos curtos e independentes.

| Documento | O que responde |
|---|---|
| [01-visao-geral.md](01-visao-geral.md) | O que o produto faz, para quem, e como é usado no dia a dia |
| [02-arquitetura.md](02-arquitetura.md) | Como a extensão é montada, por onde fala com o WhatsApp e com o servidor |
| [03-contrato-do-servidor.md](03-contrato-do-servidor.md) | Tabelas, funções, regras de acesso e arquivos que a extensão espera encontrar |
| [04-armadilhas.md](04-armadilhas.md) | **Leia antes de mexer.** As lições que custaram caro e não são óbvias |
| [05-telas.md](05-telas.md) | Inventário das telas, com as capturas em [telas/](telas/) |
| [06-integracoes.md](06-integracoes.md) | Propostas, transcrição e webhooks — o que já chama a API da BuildClinic |
| [07-marca-e-build.md](07-marca-e-build.md) | Como compilar, e como ficar só com o BuildChat |
| [08-caminhos-de-integracao.md](08-caminhos-de-integracao.md) | Três profundidades possíveis de integração com a BuildClinic, com o custo de cada uma |
| [09-acessos.md](09-acessos.md) | O que pedir ao Jonatas (nenhuma senha está nesta pasta) |
| [10-pendencias.md](10-pendencias.md) | O que ficou por fazer e o que está decidido |
| [11-guia-tecnico-completo.md](11-guia-tecnico-completo.md) | O guia vivo do projeto, com o porquê de cada decisão. É o documento mais detalhado |
| [12-planejamento-original.md](12-planejamento-original.md) | Histórico: o plano de quando o produto virou SaaS |

## Onde está o código

O código **não** foi copiado para cá de propósito: ele deve vir do repositório, com histórico.

```
GitHub: iajonatasramos-sudo/buildchat
```

Peça o acesso ao Jonatas (ver [09-acessos.md](09-acessos.md)). Clonar dá o projeto inteiro:
extensão, painel e banco. Esta pasta é o mapa, não a cópia.

## O que mais tem aqui

- [sql/](sql/) — as migrações do banco, em ordem, com um [índice](sql/INDICE.md) do que cada
  uma resolve. É o esquema inteiro, do zero ao estado atual.
- [testes/](testes/) — a suíte que roda contra um Postgres de verdade. É a rede de proteção das
  regras de acesso; qualquer mudança de política deveria passar por ela.
- [telas/](telas/) — capturas de todas as telas, tiradas do sistema em produção.

## Uma coisa que vale saber antes de tudo

O ponto mais delicado do produto **não é o servidor**: é a conversa da extensão com o WhatsApp
Web, que não tem API oficial. Isso está concentrado em dois arquivos (`src/lib/wa.ts` e
`src/page/wa-bridge.ts`) e apoiado numa biblioteca aberta, a `@wppconnect/wa-js`. O WhatsApp
muda o site sem avisar, e é daí que vem a maior parte da manutenção. O documento
[04-armadilhas.md](04-armadilhas.md) existe por causa disso.
