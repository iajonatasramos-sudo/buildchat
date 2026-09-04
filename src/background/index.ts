// Service worker — roteia eventos da extensão para o webhook configurado.

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
