CREATE TABLE IF NOT EXISTS documentos_funcionais (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  titulo VARCHAR(180) NOT NULL,
  categoria VARCHAR(40) NOT NULL CHECK (categoria IN ('identidade','cpf','contrato','portaria','termo_posse','certificados','comprovantes','afastamento','outros')),
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documentos_funcionais_usuario_idx
  ON documentos_funcionais(usuario_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS versoes_documentos_funcionais (
  id BIGSERIAL PRIMARY KEY,
  documento_id BIGINT NOT NULL REFERENCES documentos_funcionais(id) ON DELETE RESTRICT,
  versao INTEGER NOT NULL CHECK (versao > 0),
  data_documento DATE NOT NULL,
  validade DATE,
  observacao VARCHAR(1000),
  arquivo_nome VARCHAR(255) NOT NULL,
  arquivo_mime VARCHAR(100) NOT NULL,
  arquivo_tamanho INTEGER NOT NULL CHECK (arquivo_tamanho > 0),
  arquivo_bytes BYTEA NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(documento_id, versao)
);

CREATE INDEX IF NOT EXISTS versoes_documentos_funcionais_documento_idx
  ON versoes_documentos_funcionais(documento_id, versao DESC);

COMMENT ON TABLE versoes_documentos_funcionais IS
  'Histórico imutável: versões nunca devem ser atualizadas ou excluídas.';
