CREATE TABLE IF NOT EXISTS eventos_calendario_professor (
  id BIGSERIAL PRIMARY KEY,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma_id BIGINT REFERENCES turmas(id) ON DELETE CASCADE,
  titulo VARCHAR(180) NOT NULL,
  tipo VARCHAR(40) NOT NULL DEFAULT 'Evento',
  data_evento DATE NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tipo IN ('Evento','Reunião','Prazo','Formação','Conselho de classe','Feriado','Outro')),
  CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim > hora_inicio)
);
CREATE INDEX IF NOT EXISTS idx_eventos_professor_data ON eventos_calendario_professor(professor_id,data_evento);
