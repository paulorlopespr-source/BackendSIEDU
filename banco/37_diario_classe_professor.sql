CREATE TABLE IF NOT EXISTS diarios_classe (
 id BIGSERIAL PRIMARY KEY, turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 componente_curricular VARCHAR(120) NOT NULL, data_aula DATE NOT NULL,
 quantidade_aulas INTEGER NOT NULL DEFAULT 1 CHECK (quantidade_aulas BETWEEN 1 AND 10),
 conteudo TEXT NOT NULL, metodologia TEXT, observacoes TEXT,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(turma_id,professor_id,componente_curricular,data_aula)
);
CREATE TABLE IF NOT EXISTS diario_frequencias (
 diario_id BIGINT NOT NULL REFERENCES diarios_classe(id) ON DELETE CASCADE,
 aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
 presente BOOLEAN NOT NULL DEFAULT TRUE, justificada BOOLEAN NOT NULL DEFAULT FALSE,
 observacao VARCHAR(240), PRIMARY KEY(diario_id,aluno_id)
);
CREATE INDEX IF NOT EXISTS idx_diarios_professor_data ON diarios_classe(professor_id,data_aula DESC);
