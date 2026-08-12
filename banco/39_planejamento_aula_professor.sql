CREATE TABLE IF NOT EXISTS planejamentos_aula (
 id BIGSERIAL PRIMARY KEY, turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 componente_curricular VARCHAR(120) NOT NULL, data_aula DATE NOT NULL,
 bimestre INTEGER NOT NULL CHECK(bimestre BETWEEN 1 AND 4),
 quantidade_aulas INTEGER NOT NULL DEFAULT 1 CHECK(quantidade_aulas BETWEEN 1 AND 10),
 tema VARCHAR(200) NOT NULL, objetivos TEXT NOT NULL, habilidades_bncc TEXT,
 conteudos TEXT NOT NULL, metodologia TEXT NOT NULL, recursos TEXT,
 avaliacao TEXT NOT NULL, adaptacoes_inclusivas TEXT, tarefa_casa TEXT,
 observacoes TEXT, status VARCHAR(30) NOT NULL DEFAULT 'Rascunho',
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(status IN ('Rascunho','Enviado para aprovação','Aprovado','Correção solicitada'))
);
CREATE INDEX IF NOT EXISTS idx_planejamentos_professor_data ON planejamentos_aula(professor_id,data_aula DESC);
