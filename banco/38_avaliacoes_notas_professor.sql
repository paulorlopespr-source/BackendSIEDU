CREATE TABLE IF NOT EXISTS avaliacoes_professor (
 id BIGSERIAL PRIMARY KEY, turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 componente_curricular VARCHAR(120) NOT NULL, titulo VARCHAR(180) NOT NULL,
 tipo VARCHAR(40) NOT NULL, data_avaliacao DATE NOT NULL, valor_maximo NUMERIC(4,2) NOT NULL,
 bimestre INTEGER NOT NULL DEFAULT 1 CHECK (bimestre BETWEEN 1 AND 4),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(valor_maximo > 0 AND valor_maximo <= 10),
 UNIQUE(turma_id,professor_id,componente_curricular,titulo,bimestre)
);
CREATE TABLE IF NOT EXISTS notas_avaliacoes (
 avaliacao_id BIGINT NOT NULL REFERENCES avaliacoes_professor(id) ON DELETE CASCADE,
 aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
 pontos NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK(pontos BETWEEN 0 AND 10),
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(avaliacao_id,aluno_id)
);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_turma_professor ON avaliacoes_professor(turma_id,professor_id,bimestre);
