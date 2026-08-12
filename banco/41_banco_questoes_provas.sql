CREATE TABLE IF NOT EXISTS questoes_professor (
  id BIGSERIAL PRIMARY KEY,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  componente_curricular VARCHAR(120) NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'Objetiva',
  enunciado TEXT NOT NULL,
  alternativas JSONB NOT NULL DEFAULT '[]'::jsonb,
  resposta_gabarito TEXT,
  imagem TEXT,
  valor NUMERIC(4,2) NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tipo IN ('Objetiva','Discursiva','Verdadeiro ou falso')),
  CHECK (valor > 0 AND valor <= 10)
);
CREATE INDEX IF NOT EXISTS idx_questoes_professor_disciplina ON questoes_professor(professor_id, componente_curricular);
CREATE TABLE IF NOT EXISTS provas_professor (
  id BIGSERIAL PRIMARY KEY,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  atividade_id BIGINT REFERENCES atividades_programadas(id) ON DELETE SET NULL,
  componente_curricular VARCHAR(120) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  data_aplicacao DATE NOT NULL,
  instrucoes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'Programada',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('Rascunho','Programada','Aplicada','Cancelada'))
);
CREATE TABLE IF NOT EXISTS prova_questoes (
  prova_id BIGINT NOT NULL REFERENCES provas_professor(id) ON DELETE CASCADE,
  questao_id BIGINT NOT NULL REFERENCES questoes_professor(id) ON DELETE RESTRICT,
  ordem INTEGER NOT NULL,
  valor NUMERIC(4,2) NOT NULL,
  PRIMARY KEY (prova_id, questao_id),
  UNIQUE (prova_id, ordem),
  CHECK (valor > 0 AND valor <= 10)
);
CREATE INDEX IF NOT EXISTS idx_provas_professor_data ON provas_professor(professor_id, data_aplicacao);
