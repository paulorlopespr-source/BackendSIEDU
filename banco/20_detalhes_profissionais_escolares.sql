ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS diretor_nome VARCHAR(180);

ALTER TABLE funcionarios_educacao
  ALTER COLUMN cpf DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS carga_horaria VARCHAR(30),
  ADD COLUMN IF NOT EXISTS setor VARCHAR(120),
  ADD COLUMN IF NOT EXISTS formacao VARCHAR(180),
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

ALTER TABLE funcionarios_educacao
  DROP CONSTRAINT IF EXISTS ck_funcionarios_cpf,
  DROP CONSTRAINT IF EXISTS ck_funcionarios_cargo;

ALTER TABLE funcionarios_educacao
  ADD CONSTRAINT ck_funcionarios_cpf
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_nome_escola
  ON funcionarios_educacao(escola_id, LOWER(nome_completo));
