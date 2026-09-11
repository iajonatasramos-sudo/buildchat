
import { CABECALHO_SEGREDO } from '@/lib/marca';// Service worker — roteia eventos da extensão para o webhook configurado.

type MsgWebhook = { type: 'bc:webhook'; event: string; payload: unknown };

function getWebhookUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('bc2_settings', (res) => {
      resolve((res.bc2_settings?.webhookUrl as string) ?? '');
    });
  });
}

chrome.runtime.onMessage.addListener((msg: MsgWebhook, _sender, sendResponse) => {
  if (msg?.type !== 'bc:webhook') return;
  (async () => {
    const url = await getWebhookUrl();
    if (!url) {
      sendResponse({ ok: false, erro: 'Webhook não configurado.' });
      return;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'buildchat', event: msg.event, payload: msg.payload }),
      });
      sendResponse({ ok: res.ok, status: res.status });
    } catch (e: any) {
      sendResponse({ ok: false, erro: e?.message ?? 'Falha no webhook.' });
    }
  })();
  return true; // resposta assíncrona
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[BuildChat] instalado.');
});

// ── Automações ──────────────────────────────────────────────────────────────
// A fila de execuções vive no content script (o WhatsApp é o da aba). O
// service worker só garante que ela seja olhada mesmo quando a aba está
// parada em segundo plano: um alarme por minuto manda "bc:fila".
chrome.alarms.create('bc:fila', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== 'bc:fila') return;
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (abas) => {
    for (const aba of abas) if (aba.id) chrome.tabs.sendMessage(aba.id, { type: 'bc:fila' }, () => void chrome.runtime.lastError);
  });
});

// Webhook com URL própria: o das Automações (com segredo) e o da barra lateral
// ("WebHooks"). Os dois saem daqui porque a URL é de qualquer domínio.
type MsgWebhookAuto = { type: 'bc:webhook:auto' | 'bc:webhook:saida'; url: string; segredo?: string; event: string; payload: unknown };
chrome.runtime.onMessage.addListener((msg: MsgWebhookAuto, _sender, sendResponse) => {
  if (msg?.type !== 'bc:webhook:auto' && msg?.type !== 'bc:webhook:saida') return;
  (async () => {
    const corpo = JSON.stringify({ source: 'buildchat', event: msg.event, payload: msg.payload });
    try {
      const res = await fetch(msg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(msg.segredo ? { [CABECALHO_SEGREDO]: msg.segredo } : {}) },
        body: corpo,
      });
      sendResponse({ ok: res.ok, status: res.status });
    } catch {
      // Sem permissão para o domínio (ou sem CORS do outro lado), o navegador
      // barra a resposta. O envio "cego" ainda entrega o corpo: vai como
      // text/plain, que não exige verificação prévia (preflight). O preço é
      // não saber o que o destino respondeu.
      try {
        await fetch(msg.url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: corpo,
        });
        sendResponse({ ok: true, semConfirmacao: true });
      } catch (e: any) {
        sendResponse({ ok: false, erro: e?.message ?? 'Falha no webhook.' });
      }
    }
  })();
  return true;
});
