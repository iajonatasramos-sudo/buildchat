# 6. Integrações

Três pontos em que o BuildChat já fala com o mundo fora dele. Os dois primeiros **já apontam
para a BuildClinic**, o que é meio caminho andado para a integração.

## 1. Gerar proposta

O PDF **não é montado na extensão**. Ela manda os dados e recebe o arquivo pronto.

```
POST https://app.buildclinic.com.br/api/propostas/gerar?token=…
resposta: application/pdf
```

- O endereço e o token vêm da tabela `integracoes`, cadastrados pelo dono do produto em
  `/sistema/api`. A configuração de uma clínica vence a global. **Não existe token dentro da
  extensão.**
- **Sem a integração, o botão não existe** para aquela clínica. Não aparece desabilitado:
  simplesmente não está lá. Desligar a integração faz o botão sumir na sincronização seguinte.
- Tipos de proposta hoje: execução e interiores (São Paulo e Brasil) e vigilância. Interiores
  troca metragem por número de ambientes; vigilância parcela em três e tem três formas de
  exibição.
- Toda proposta gerada fica no servidor: metadados numa tabela, PDF no armazenamento. A guia
  Contato lista as anteriores com "abrir" e "enviar na conversa".
- Trocar o endereço para outro domínio exige liberar esse domínio no manifesto da extensão.

## 2. Transcrever áudio

```
POST https://app.buildclinic.com.br/api/transcrever?token=…
corpo: multipart, campo "file", até 25 MB
```

- Usa a integração `transcricao`; se ela não existir, cai no token da proposta, que é da mesma
  API. Quem já configurou proposta ganha transcrição sem fazer nada.
- Sem nenhum dos dois, o botão não aparece.

## 3. WebHooks de saída

Dois mecanismos diferentes, com propósitos diferentes:

**O webhook do balcão** (ícone na barra lateral). Dispara a cada **mensagem recebida de um
contato** (grupo fica de fora). A pessoa escolhe o endereço e o que enviar: dados do evento,
número, foto, pastas do contato, perfil do contato e usuário logado. Guarda os últimos trinta
envios para conferência.

Exemplo do corpo, com tudo marcado:

```json
{
  "source": "buildchat",
  "event": "mensagem_recebida",
  "payload": {
    "evento": "mensagem_recebida",
    "em": "2026-09-11T12:00:07.294Z",
    "chat_id": "5511964788124@c.us",
    "mensagem": { "id": "…", "texto": "Bom dia, consigo remarcar?", "tipo": "chat", "de_mim": false },
    "numero": "+55 11 96478-8124",
    "foto": "https://…",
    "pastas": [{ "id": "…", "nome": "Lead", "cor": "#2563EB" }],
    "contato": { "nome": "Dr. Jonatas", "telefone": "5511964788124", "interesses": "sala 43m²" },
    "usuario": { "id": "…", "nome": "Patricia", "email": "…", "papel": "usuario", "empresa": { "nome": "BuildClinic" } }
  }
}
```

**O webhook das automações**, que nasce dentro de uma regra e tem eventos próprios (proposta
gerada, proposta enviada, contato entrou em pasta) e um cabeçalho de segredo.

Os dois saem pelo service worker, nunca da página. Se o domínio de destino não estiver
autorizado no Chrome, o envio ainda acontece, mas sem leitura da resposta. Ver
[04-armadilhas.md](04-armadilhas.md).

## Por que isso importa para a integração

Se a meta é **os dados do WhatsApp aparecerem na BuildClinic**, o caminho mais curto já está
construído: a BuildClinic recebe o webhook e trata o lead. Nenhuma linha da extensão precisa
mudar, só o endereço configurado na tela. Os caminhos mais profundos estão em
[08-caminhos-de-integracao.md](08-caminhos-de-integracao.md).
