-- Cadastro funcional completo e trilha de permissões do SIEDU.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome_social VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS genero VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone_institucional VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_pessoal VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_residencial TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contato_emergencia_nome VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contato_emergencia_telefone VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS matricula_funcional VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(120);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS funcao_exercida VARCHAR(120);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_vinculo VARCHAR(60);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS situacao_funcional VARCHAR(30) DEFAULT 'ativo';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_admissao DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_desligamento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS carga_horaria_semanal NUMERIC(5,2);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS turnos_trabalho TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS secretaria_setor VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS disciplinas TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS turmas_atendidas TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS gestor_imediato VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS observacoes_administrativas TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS situacao_acesso VARCHAR(30) DEFAULT 'pendente';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dois_fatores_obrigatorio BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dois_fatores_ativo BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_id UUID;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_mime VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_bytes BYTEA;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_atualizada_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_matricula_funcional_unica
  ON usuarios (LOWER(matricula_funcional))
  WHERE matricula_funcional IS NOT NULL;

CREATE INDEX IF NOT EXISTS usuarios_situacao_funcional_idx
  ON usuarios (situacao_funcional);

CREATE INDEX IF NOT EXISTS usuarios_situacao_acesso_idx
  ON usuarios (situacao_acesso);

CREATE TABLE IF NOT EXISTS historico_permissoes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_usuario_id INTEGER REFERENCES tipos_usuarios(id),
  escolas_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  situacao_acesso VARCHAR(30) NOT NULL,
  acao VARCHAR(50) NOT NULL,
  realizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historico_permissoes_usuario_idx
  ON historico_permissoes (usuario_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS historico_fotos_perfil (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  foto_id UUID,
  acao VARCHAR(20) NOT NULL CHECK (acao IN ('incluida', 'alterada', 'removida')),
  realizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_situacao_funcional_valida'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_situacao_funcional_valida
      CHECK (situacao_funcional IN ('ativo', 'afastado', 'licenca', 'cedido', 'desligado'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_situacao_acesso_valida'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_situacao_acesso_valida
      CHECK (situacao_acesso IN ('ativo', 'bloqueado', 'pendente', 'desligado'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_desligamento_coerente'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_desligamento_coerente
      CHECK (data_desligamento IS NULL OR data_admissao IS NULL OR data_desligamento >= data_admissao);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_carga_horaria_valida'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_carga_horaria_valida
      CHECK (carga_horaria_semanal IS NULL OR carga_horaria_semanal BETWEEN 1 AND 80);
  END IF;
END $$;
