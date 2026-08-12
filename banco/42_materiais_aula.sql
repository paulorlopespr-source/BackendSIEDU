CREATE TABLE IF NOT EXISTS materiais_aula (
  id BIGSERIAL PRIMARY KEY,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  componente_curricular VARCHAR(120) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  descricao TEXT,
  conteudo_texto TEXT,
  url_externa TEXT,
  arquivo_dados TEXT,
  arquivo_nome VARCHAR(255),
  arquivo_mime VARCHAR(120),
  publicado BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tipo IN ('Texto','Vídeo','Livro','Slide','Documento','Imagem','Link','Outro'))
);
CREATE INDEX IF NOT EXISTS idx_materiais_turma_publicado ON materiais_aula(turma_id,publicado);
CREATE INDEX IF NOT EXISTS idx_materiais_professor ON materiais_aula(professor_id);
