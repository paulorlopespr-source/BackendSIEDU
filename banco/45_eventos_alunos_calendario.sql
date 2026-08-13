ALTER TABLE eventos_calendario_professor
  ADD COLUMN IF NOT EXISTS publico VARCHAR(30) NOT NULL DEFAULT 'Profissional';
ALTER TABLE eventos_calendario_professor
  DROP CONSTRAINT IF EXISTS eventos_calendario_professor_publico_check;
ALTER TABLE eventos_calendario_professor
  ADD CONSTRAINT eventos_calendario_professor_publico_check
  CHECK (publico IN ('Profissional','Toda a turma','Alunos selecionados'));
CREATE TABLE IF NOT EXISTS evento_calendario_alunos (
  evento_id BIGINT NOT NULL REFERENCES eventos_calendario_professor(id) ON DELETE CASCADE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  PRIMARY KEY(evento_id,aluno_id)
);
CREATE INDEX IF NOT EXISTS idx_evento_alunos_aluno ON evento_calendario_alunos(aluno_id);
