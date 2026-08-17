CREATE TABLE IF NOT EXISTS afastamentos_funcionais (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('ferias','licenca','licenca_medica','licenca_parental','afastamento_administrativo','capacitacao','outros')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  retorno_previsto DATE NOT NULL,
  motivo TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','concluido','cancelado')),
  documento_nome VARCHAR(255),
  documento_mime VARCHAR(100),
  documento_tamanho INTEGER,
  documento_bytes BYTEA,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT afastamento_periodo_valido CHECK (data_fim >= data_inicio),
  CONSTRAINT afastamento_retorno_valido CHECK (retorno_previsto > data_fim)
);

CREATE INDEX IF NOT EXISTS afastamentos_funcionais_usuario_idx ON afastamentos_funcionais(usuario_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS afastamentos_funcionais_retorno_idx ON afastamentos_funcionais(retorno_previsto) WHERE status='confirmado';

CREATE TABLE IF NOT EXISTS historico_afastamentos_funcionais (
  id BIGSERIAL PRIMARY KEY,
  afastamento_id BIGINT NOT NULL REFERENCES afastamentos_funcionais(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(50) NOT NULL,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30),
  dados JSONB NOT NULL DEFAULT '{}'::JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historico_afastamentos_idx ON historico_afastamentos_funcionais(afastamento_id, criado_em DESC);
