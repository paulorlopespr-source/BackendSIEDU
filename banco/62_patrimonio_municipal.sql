CREATE TABLE IF NOT EXISTS bens_patrimoniais (
  id BIGSERIAL PRIMARY KEY,
  numero_patrimonial VARCHAR(60) NOT NULL UNIQUE,
  descricao VARCHAR(255) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  marca_modelo VARCHAR(180),
  numero_serie VARCHAR(120),
  escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
  setor VARCHAR(120),
  localizacao VARCHAR(180) NOT NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  estado_conservacao VARCHAR(30) NOT NULL CHECK (estado_conservacao IN ('Novo','Bom','Regular','Ruim','Inservível')),
  situacao VARCHAR(30) NOT NULL DEFAULT 'Em uso' CHECK (situacao IN ('Em uso','Estoque','Manutenção','Transferência','Inservível','Baixado')),
  data_aquisicao DATE,
  valor_aquisicao NUMERIC(14,2) CHECK (valor_aquisicao IS NULL OR valor_aquisicao>=0),
  com_divergencia BOOLEAN NOT NULL DEFAULT FALSE,
  divergencia_descricao TEXT,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (escola_id IS NOT NULL OR NULLIF(TRIM(setor),'') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bens_patrimoniais_situacao_idx ON bens_patrimoniais(situacao, categoria);
CREATE INDEX IF NOT EXISTS bens_patrimoniais_escola_idx ON bens_patrimoniais(escola_id, localizacao);

CREATE TABLE IF NOT EXISTS historico_bens_patrimoniais (
  id BIGSERIAL PRIMARY KEY,
  bem_id BIGINT NOT NULL REFERENCES bens_patrimoniais(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(50) NOT NULL,
  descricao TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historico_bens_idx ON historico_bens_patrimoniais(bem_id, criado_em DESC);
