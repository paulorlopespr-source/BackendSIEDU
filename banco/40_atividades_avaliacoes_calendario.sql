CREATE TABLE IF NOT EXISTS horarios_professor (
 id BIGSERIAL PRIMARY KEY, professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
 turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 componente_curricular VARCHAR(120) NOT NULL, dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 0 AND 6),
 hora_inicio TIME NOT NULL, hora_fim TIME NOT NULL, sala VARCHAR(40), ativo BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK(hora_fim>hora_inicio), UNIQUE(professor_id,turma_id,dia_semana,hora_inicio)
);
CREATE TABLE IF NOT EXISTS atividades_programadas (
 id BIGSERIAL PRIMARY KEY, professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
 turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
 componente_curricular VARCHAR(120) NOT NULL, tipo VARCHAR(40) NOT NULL,
 titulo VARCHAR(180) NOT NULL, descricao TEXT, data_evento DATE NOT NULL,
 hora_inicio TIME NOT NULL, hora_fim TIME NOT NULL, valor NUMERIC(4,2),
 instrucoes TEXT, materiais TEXT, status VARCHAR(30) NOT NULL DEFAULT 'Programada',
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(tipo IN ('Atividade','Prova','Avaliação','Trabalho','Seminário')),
 CHECK(status IN ('Programada','Aplicada','Cancelada')),
 CHECK(valor IS NULL OR (valor>0 AND valor<=10))
);
CREATE INDEX IF NOT EXISTS idx_atividades_professor_data ON atividades_programadas(professor_id,data_evento,hora_inicio);
WITH p AS (SELECT id FROM professores WHERE usuario_id=(SELECT id FROM usuarios WHERE usuario='carlos.professor.2026')),
t AS (SELECT tp.turma_id,tp.componente_curricular FROM turma_professores tp JOIN p ON p.id=tp.professor_id ORDER BY tp.turma_id LIMIT 1)
INSERT INTO horarios_professor(professor_id,turma_id,componente_curricular,dia_semana,hora_inicio,hora_fim,sala)
SELECT p.id,t.turma_id,t.componente_curricular,1,TIME '08:00',TIME '08:50','07' FROM p CROSS JOIN t ON CONFLICT DO NOTHING;
