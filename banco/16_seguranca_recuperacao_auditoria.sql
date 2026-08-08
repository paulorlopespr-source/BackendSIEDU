CREATE TABLE IF NOT EXISTS recuperacoes_senha (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash VARCHAR(64) NOT NULL,
  solicitado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMP NOT NULL,
  utilizado_em TIMESTAMP,
  tentativas INTEGER NOT NULL DEFAULT 0,
  ip_solicitacao VARCHAR(80)
);

CREATE INDEX IF NOT EXISTS idx_recuperacoes_usuario
  ON recuperacoes_senha(usuario_id, solicitado_em DESC);

CREATE TABLE IF NOT EXISTS fila_emails_sistema (
  id BIGSERIAL PRIMARY KEY,
  destinatario VARCHAR(160) NOT NULL,
  assunto VARCHAR(200) NOT NULL,
  corpo TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
    CHECK (status IN ('Pendente', 'Enviado', 'Erro')),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  enviado_em TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_sistema (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(30) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  registro_id VARCHAR(80),
  metodo VARCHAR(10) NOT NULL,
  rota TEXT NOT NULL,
  dados JSONB,
  ip VARCHAR(80),
  user_agent TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
  ON auditoria_sistema(usuario_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_entidade
  ON auditoria_sistema(entidade, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_normalizado
  ON usuarios(LOWER(email));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_cpf_somente_digitos'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_cpf_somente_digitos
      CHECK (cpf ~ '^[0-9]{11}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_email_formato_basico'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_email_formato_basico
      CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') NOT VALID;
  END IF;
END $$;
