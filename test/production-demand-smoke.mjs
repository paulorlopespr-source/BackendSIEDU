const baseUrl = process.env.SIEDU_API_URL;
const password = process.env.TEST_FLOW_PASSWORD;

if (!baseUrl || !password) throw new Error('Configure SIEDU_API_URL e TEST_FLOW_PASSWORD.');

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${payload.message || 'Falha'}`);
  return payload;
}

async function login(usuario) {
  const payload = await request('/auth/login', { method: 'POST', body: { usuario, senha: password } });
  return payload.token;
}

const [directorToken, secretaryToken, administrationToken] = await Promise.all([
  login('teste.fluxo.diretor'),
  login('teste.fluxo.secretaria'),
  login('teste.fluxo.administracao'),
]);

const context = await request('/academic/context', { token: directorToken });
const schoolId = context.escolas?.[0]?.id;
if (!schoolId) throw new Error('O Diretor de teste não possui escola vinculada.');

const testCases = [
  { titulo: '[TESTE] Reforma estrutural do telhado', categoria: 'Infraestrutura', prioridade: 'Alta', descricao: 'Teste controlado de demanda urgente para reparo estrutural no telhado da unidade.' },
  { titulo: '[TESTE] Reposição de material didático', categoria: 'Material didático', prioridade: 'Normal', descricao: 'Teste controlado de demanda normal para reposição de materiais didáticos da unidade.' },
  { titulo: '[TESTE] Aquisição de lâmpadas', categoria: 'Material ou insumo', prioridade: 'Baixa', descricao: 'Teste controlado de demanda de baixa urgência para aquisição de lâmpadas da unidade.' },
];

const created = [];
for (const item of testCases) {
  created.push(await request('/municipal/demands', {
    method: 'POST', token: directorToken, body: { ...item, escolaId: schoolId, prazo: null },
  }));
}

const [high, normal, low] = created;
await request(`/municipal/demands/${high.id}/decision`, { method: 'POST', token: secretaryToken, body: { acao: 'autorizar', mensagem: 'Teste: execução urgente autorizada.' } });
await request(`/municipal/demands/${normal.id}/decision`, { method: 'POST', token: secretaryToken, body: { acao: 'analisar', mensagem: 'Teste: demanda normal analisada.' } });
await request(`/municipal/demands/${normal.id}/decision`, { method: 'POST', token: secretaryToken, body: { acao: 'autorizar', mensagem: 'Teste: execução normal autorizada após análise.' } });
await request(`/municipal/demands/${low.id}/decision`, { method: 'POST', token: secretaryToken, body: { acao: 'pendente', mensagem: 'Teste: demanda de baixa urgência deixada pendente.' } });
await request(`/municipal/demands/${low.id}/decision`, { method: 'POST', token: secretaryToken, body: { acao: 'autorizar', mensagem: 'Teste: execução de baixa urgência autorizada.' } });

await request(`/municipal/demands/${high.id}/execution`, { method: 'POST', token: administrationToken, body: { acao: 'pendente', mensagem: 'Teste: tarefa urgente recebida e pendente.' } });
await request(`/municipal/demands/${high.id}/execution`, { method: 'POST', token: administrationToken, body: { acao: 'concluir', mensagem: 'Teste: reparo estrutural concluído.' } });
await request(`/municipal/demands/${normal.id}/execution`, { method: 'POST', token: administrationToken, body: { acao: 'concluir', mensagem: 'Teste: material didático entregue.' } });
await request(`/municipal/demands/${low.id}/execution`, { method: 'POST', token: administrationToken, body: { acao: 'pendente', mensagem: 'Teste: aquisição de lâmpadas pendente.' } });
await request(`/municipal/demands/${low.id}/execution`, { method: 'POST', token: administrationToken, body: { acao: 'concluir', mensagem: 'Teste: lâmpadas entregues à unidade.' } });

const [demands, secretaryNotifications, administrationNotifications, directorNotifications] = await Promise.all([
  request('/municipal/demands', { token: secretaryToken }),
  request('/municipal/demands/notifications', { token: secretaryToken }),
  request('/municipal/demands/notifications', { token: administrationToken }),
  request('/municipal/demands/notifications', { token: directorToken }),
]);

const ids = new Set(created.map((item) => item.id));
const tested = demands.filter((item) => ids.has(item.id));
if (tested.length !== 3 || tested.some((item) => item.status !== 'Demanda resolvida')) {
  throw new Error('O fluxo não terminou com as três demandas resolvidas.');
}

console.log(JSON.stringify({
  schoolId,
  demands: tested.map((item) => ({ id: item.id, prioridade: item.prioridade, status: item.status, historico: item.historico.length })),
  notifications: {
    secretaria: secretaryNotifications.filter((item) => ids.has(item.demandaId)).length,
    administracao: administrationNotifications.filter((item) => ids.has(item.demandaId)).length,
    direcao: directorNotifications.filter((item) => ids.has(item.demandaId)).length,
  },
}, null, 2));
