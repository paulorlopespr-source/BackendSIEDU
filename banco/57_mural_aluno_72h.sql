CREATE TABLE IF NOT EXISTS mural_aluno_posts (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  texto VARCHAR(500),
  imagem_dados TEXT,
  imagem_mime VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'Publicado' CHECK (status IN ('Publicado','Pendente','Removido','Expirado')),
  motivo_moderacao VARCHAR(500),
  moderado_por INTEGER REFERENCES usuarios(id),
  moderado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  CHECK (texto IS NOT NULL OR imagem_dados IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_mural_aluno_turma_status_expira
  ON mural_aluno_posts (turma_id, status, expira_em DESC);

CREATE INDEX IF NOT EXISTS idx_mural_aluno_escola_status
  ON mural_aluno_posts (escola_id, status, criado_em DESC);
