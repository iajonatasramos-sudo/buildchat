# 5. As telas

Capturas em [telas/](telas/), tiradas do sistema em produção com uma conta real de atendente.

## Extensão, dentro do WhatsApp Web

| Tela | Arquivo | O que é |
|---|---|---|
| Login | `extensao-01-login.png` | Sem conta, nada funciona. O WhatsApp em si segue livre, porque a tela do QR precisa funcionar |
| Barra do topo | `extensao-02-barra-do-topo.png` | Marca (volta ao WhatsApp), agenda, chips das pastas, "+" de pastas, conta, engrenagem |
| Guia Contato | `extensao-03-guia-contato.png` | Telefone, etiquetas, interesses, agendamentos, propostas e anotações do contato aberto |
| Mensagens rápidas | `extensao-04-mensagens-rapidas.png` | Acervo por categoria, busca e filtros |
| Automações | `extensao-05-automacoes.png` | Bots, campanhas, notificações e webhook |
| WebHooks | `extensao-06-webhooks.png` | Endereço, o que enviar e histórico dos envios |
| Agenda | `extensao-07-agenda.png` | Calendário em semana, com filtros e etiquetas |
| Configurações | `extensao-08-configuracoes.png` | Minha conta, trocar senha, tema, atalho e backup |
| Minhas pastas | `extensao-09-minhas-pastas.png` | Criar e apagar pasta sem ir ao painel |

Não estão nas capturas, por precisarem de uma conversa real com conteúdo:

- o botão **Transcrever**, que nasce dentro da bolha de áudio;
- o **Ver mensagem apagada**, que nasce onde o WhatsApp escreveu que a mensagem foi apagada;
- a faixa **"Executando atividade 2/3"**, que aparece enquanto uma sequência roda;
- o **picker do `/`**, que abre sobre a caixa de mensagem.

## Painel web

| Tela | Arquivo | O que é |
|---|---|---|
| Entrar | `painel-01-entrar.png` | Login e criação de clínica |
| Visão geral | `painel-02-visao-geral.png` | Assinatura, assentos e uso (muda para atendente) |
| Contatos | `painel-03-contatos.png` | O CRM: planilha com origem, usuário, pastas, propostas, notas |
| Agenda | `painel-04-agenda.png` | O mesmo calendário da extensão |
| Mensagens padrão | `painel-05-mensagens.png` | Acervo da clínica, agrupado por categoria |
| Pastas | `painel-06-pastas.png` | Pastas padrão e pessoais, com visibilidade |
| Instalar | `painel-07-instalar.png` | Página pública com o arquivo e o passo a passo |

Não capturadas por exigirem conta de administrador ou de dono do produto: usuários,
departamentos, acessos, assinatura, ficha do contato e toda a área `/sistema` (clínicas,
vendas, faturas, integrações).

## Uma observação sobre o visual

Os tokens visuais vêm do protótipo do BuildClinic: marca em índigo, fundo claro, cartões com
canto arredondado, tipografia Plus Jakarta Sans. Dentro da extensão existem três temas (claro,
grafite e escuro), escolhidos automaticamente pelo tema do WhatsApp ou fixados nas
configurações. **Toda cor vem de um token**; fixar cinza ou branco na mão quebra em um dos três.
