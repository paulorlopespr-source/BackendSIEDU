const provider = String(process.env.EMAIL_PROVIDER || 'console').toLowerCase();

export async function sendSystemEmail({ to, subject, text }) {
  if (provider === 'console') {
    if (process.env.NODE_ENV !== 'production') console.info(`[e-mail] ${to} · ${subject}`);
    return { sent: false, queued: true };
  }
  if (provider !== 'resend' || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error('Provedor de e-mail não configurado. Defina EMAIL_PROVIDER, RESEND_API_KEY e EMAIL_FROM.');
  }
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
  });
  if (!result.ok) throw new Error(`Falha no envio de e-mail (HTTP ${result.status}).`);
  return { sent: true, provider: 'resend' };
}
