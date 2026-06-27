/**
 * APO.YA — Registra el webhook de Telegram
 * 
 * Llama a este endpoint UNA SOLA VEZ después del deploy:
 * GET https://tu-proyecto.vercel.app/api/setup-webhook
 * 
 * Esto le dice a Telegram que envíe todos los mensajes del grupo
 * a tu endpoint /api/telegram.
 */

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : req.headers.host
      ? `https://${req.headers.host}`
      : null;

  if (!token) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN no configurado' });
  if (!baseUrl) return res.status(500).json({ error: 'No se pudo determinar la URL del proyecto' });

  const webhookUrl = `${baseUrl}/api/telegram`;

  try {
    // Registrar webhook
    const r = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'channel_post'],
          drop_pending_updates: true
        })
      }
    );
    const data = await r.json();

    // Verificar info del webhook
    const info = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    ).then(r => r.json());

    return res.status(200).json({
      registro: data,
      webhook_url: webhookUrl,
      info: info.result
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
