-- Calendário institucional exibido aos alunos, com escopo de rede, escola ou turma.

CREATE TABLE IF NOT EXISTS eventos_calendario_escolar (
  id BIGSERIAL PRIMARY KEY,
  escopo VARCHAR(16) NOT NULL DEFAULT 'Rede',
  escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
  turma_id BIGINT REFERENCES turmas(id) ON DELETE CASCADE,
  titulo VARCHAR(180) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  disciplina VARCHAR(120),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  hora_inicio TIME,
  hora_fim TIME,
  observacao TEXT,
  destaque BOOLEAN NOT NULL DEFAULT FALSE,
  publicado BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_calendario_escolar_escopo CHECK (
    escopo IN ('Rede', 'Escola', 'Turma')
  ),
  CONSTRAINT ck_calendario_escolar_tipo CHECK (
    tipo IN (
      'Ano letivo', 'Período letivo', 'Feriado', 'Recesso', 'Férias',
      'Avaliação', 'Avaliação de Ciclo', 'Atividade', 'Prazo final',
      'Nota publicada',
      'Simulado IDEB', 'Simulado SAEB', 'Recuperação',
      'Conselho de classe', 'Reunião', 'Evento escolar',
      'Entrega de boletim', 'Exame final', 'Aviso'
    )
  ),
  CONSTRAINT ck_calendario_escolar_periodo CHECK (
    data_fim IS NULL OR data_fim >= data_inicio
  ),
  CONSTRAINT ck_calendario_escolar_horario CHECK (
    hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim > hora_inicio
  ),
  CONSTRAINT ck_calendario_escolar_destino CHECK (
    (escopo = 'Rede' AND escola_id IS NULL AND turma_id IS NULL)
    OR (escopo = 'Escola' AND escola_id IS NOT NULL AND turma_id IS NULL)
    OR (escopo = 'Turma' AND turma_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_calendario_escolar_periodo
  ON eventos_calendario_escolar(data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_calendario_escolar_escola
  ON eventos_calendario_escolar(escola_id, data_inicio)
  WHERE publicado = TRUE;
CREATE INDEX IF NOT EXISTS idx_calendario_escolar_turma
  ON eventos_calendario_escolar(turma_id, data_inicio)
  WHERE publicado = TRUE;
