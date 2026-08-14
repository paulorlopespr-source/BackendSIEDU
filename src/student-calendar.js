const text = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function calendarCategory(type) {
  const value = text(type);
  if (value.includes('simulado')) return 'Simulados';
  if (value.includes('avaliacao') || value.includes('prova') || value.includes('exame') || value.includes('nota')) return 'Avaliações';
  if (value.includes('atividade') || value.includes('prazo')) return 'Atividades';
  if (value.includes('reuniao') || value.includes('conselho')) return 'Reuniões';
  if (value.includes('feriado') || value.includes('recesso') || value.includes('ferias')) return 'Feriados e recessos';
  if (value.includes('aviso')) return 'Avisos';
  return 'Eventos escolares';
}

export function calendarVisual(type) {
  const value = text(type);
  if (value.includes('ciclo')) return 'cycle';
  if (value.includes('simulado')) return 'simulation';
  if (value.includes('recuperacao')) return 'recovery';
  if (value.includes('boletim')) return 'report';
  if (value.includes('nota')) return 'grade';
  if (value.includes('prazo')) return 'deadline';
  if (value.includes('atividade')) return 'activity';
  if (value.includes('avaliacao') || value.includes('prova') || value.includes('exame')) return 'assessment';
  if (value.includes('reuniao') || value.includes('conselho')) return 'meeting';
  if (value.includes('feriado')) return 'holiday';
  if (value.includes('recesso') || value.includes('ferias')) return 'vacation';
  if (value.includes('aviso')) return 'notice';
  return 'school-event';
}

export function calendarEvent(source, item, overrides = {}) {
  const type = overrides.tipo || item.tipo || 'Evento escolar';
  return {
    id: `${source}-${item.id}`,
    titulo: item.titulo,
    tipo: type,
    categoria: calendarCategory(type),
    visual: calendarVisual(type),
    dataInicio: overrides.dataInicio || item.dataInicio || item.data || item.prazo || item.dataFim,
    dataFim: overrides.dataFim || item.dataFim || null,
    horaInicio: item.horaInicio || null,
    horaFim: item.horaFim || null,
    disciplina: item.disciplina || null,
    observacao: item.observacao || item.descricao || item.instrucoes || null,
    origem: overrides.origem || source,
    escopo: item.escopo || overrides.escopo || 'Turma',
    destaque: Boolean(item.destaque),
  };
}
