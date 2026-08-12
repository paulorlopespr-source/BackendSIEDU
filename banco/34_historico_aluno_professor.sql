CREATE TABLE IF NOT EXISTS notas_alunos (
 id BIGSERIAL PRIMARY KEY, aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
 turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 componente_curricular VARCHAR(120) NOT NULL, avaliacao VARCHAR(160) NOT NULL,
 nota NUMERIC(4,2) NOT NULL CHECK (nota BETWEEN 0 AND 10), data_avaliacao DATE NOT NULL DEFAULT CURRENT_DATE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS faltas_alunos (
 id BIGSERIAL PRIMARY KEY, aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
 turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 componente_curricular VARCHAR(120) NOT NULL, data_aula DATE NOT NULL,
 quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0), justificada BOOLEAN NOT NULL DEFAULT FALSE,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS atividades_alunos (
 id BIGSERIAL PRIMARY KEY, aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
 turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 titulo VARCHAR(180) NOT NULL, prazo DATE NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT ck_atividade_status CHECK (status IN ('Pendente','Entregue','Atrasada','Avaliada'))
);
CREATE INDEX IF NOT EXISTS idx_notas_aluno_turma ON notas_alunos(aluno_id,turma_id);
CREATE INDEX IF NOT EXISTS idx_faltas_aluno_turma ON faltas_alunos(aluno_id,turma_id);
CREATE INDEX IF NOT EXISTS idx_atividades_aluno_turma ON atividades_alunos(aluno_id,turma_id,status);
