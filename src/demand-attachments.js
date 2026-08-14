const MAX_DEMAND_ATTACHMENT_BYTES = 5_000_000;

const ALLOWED_DEMAND_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

export function safeDemandFilename(value) {
  return String(value || 'anexo')
    .replace(/[\r\n"\\/]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 255) || 'anexo';
}

export function decodeDemandAttachment(attachment) {
  if (!attachment) return null;
  const match = String(attachment.dados || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Formato do anexo inválido. Selecione novamente o arquivo.');
  const mime = match[1].toLowerCase();
  if (!ALLOWED_DEMAND_ATTACHMENT_MIMES.has(mime)) {
    throw new Error('Tipo de arquivo não permitido. Envie imagem, PDF, Word, Excel ou TXT.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new Error('O anexo selecionado está vazio.');
  if (bytes.length > MAX_DEMAND_ATTACHMENT_BYTES) throw new Error('O anexo deve ter no máximo 5 MB.');
  return { nome: safeDemandFilename(attachment.nome), mime, bytes };
}

export function demandAttachmentDisposition(filename) {
  const safe = safeDemandFilename(filename);
  const ascii = safe.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
