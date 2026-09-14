# 1. Visão geral

## O que é

Uma extensão do Chrome (Manifest V3) que roda **dentro do WhatsApp Web** e acrescenta, na
própria tela do WhatsApp, o que uma equipe de atendimento precisa e o WhatsApp não tem.

Quem usa não sai do WhatsApp: a extensão desenha uma barra no topo, uma barra lateral à
direita e uma gaveta, todas convivendo com a interface original.

## Para quem

Equipes que atendem clientes pelo WhatsApp. No grupo BuildClinic é usada pelo time comercial e
de projetos: cada pessoa conecta o próprio número, e o acervo (mensagens, pastas, contatos) é
da clínica.

## O que faz

**Mensagens rápidas.** Sequências de ações, não só um texto: manda texto, imagem, áudio (como
mensagem de voz, com onda), vídeo ou documento, espera N segundos entre uma e outra, coloca ou
tira o contato de uma pasta. Aceita variáveis (`{{nome}}`, `{{saudacao}}`, `{{data}}`).
Atalho: digitar `/` na caixa de mensagem abre a busca.

**Pastas (etiquetas).** Organizam as conversas. Ficam como chips na barra do topo, dá para
arrastar para mudar a ordem e para filtrar por várias ao mesmo tempo (aparecem só as conversas
que estão em todas). Cada pessoa cria as suas; o administrador cria as da clínica e escolhe
quem enxerga cada uma.

**Guia Contato.** Telefone real, nome de tratamento, etiquetas, interesses, agendamentos,
propostas e anotações do contato aberto. É o CRM no lugar onde a conversa acontece.

**Agenda.** Calendário em dia, semana e mês, com etiquetas de atividade e filtro por atrasadas.
O retorno combinado na conversa é marcado ali mesmo, pela guia Contato.

**Propostas.** Gera o PDF chamando a API da BuildClinic, guarda no servidor e permite reenviar
na conversa depois.

**Transcrever áudio.** Um botão em cada mensagem de voz; o texto vem da API da BuildClinic.

**Mensagens apagadas.** Guarda o que passou pela tela e, quando alguém apaga, mostra o que
estava escrito. Tudo local, nada disso sobe para servidor nenhum.

**Automações.** Bots que reagem a mensagem recebida, campanhas, notificações e webhook. O motor
roda no navegador, porque o WhatsApp é o da aba.

**WebHooks.** Manda os dados do contato para outro sistema assim que a mensagem chega.

## Como a equipe usa, na prática

1. Instala a extensão no Chrome e entra com a conta que o administrador criou.
2. Abre o WhatsApp Web normalmente. A barra do BuildChat aparece no topo.
3. Atende. Etiqueta a conversa, anota o que combinou, marca o retorno, manda a proposta.
4. O administrador acompanha tudo pelo painel web, que mostra os contatos como uma planilha de
   CRM, com pastas, propostas, anotações e último contato.

## Onde cada coisa mora hoje

| Parte | Onde | Observação |
|---|---|---|
| Extensão | Chrome de cada pessoa | Distribuída por arquivo .zip; ainda não está na Chrome Web Store |
| Painel web | Next.js, deploy por Dokploy | `chat.buildclinic.com.br` |
| Banco, login e arquivos | Supabase | Um projeto, várias clínicas isoladas por regra de linha |
| API de proposta e transcrição | BuildClinic | `app.buildclinic.com.br`, com token por clínica |

## Números do sistema hoje

```
migrações do banco     33
tabelas                21
telas do painel        17
suíte de testes        188 testes, contra Postgres real
```
