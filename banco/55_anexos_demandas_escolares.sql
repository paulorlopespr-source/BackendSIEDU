CREATE TABLE IF NOT EXISTS anexos_demandas_municipais (
  id BIGSERIAL PRIMARY KEY,
  demanda_id BIGINT NOT NULL REFERENCES demandas_municipais(id) ON DELETE CASCADE,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  tamanho INTEGER NOT NULL CHECK (tamanho > 0 AND tamanho <= 5000000),
  conteudo BYTEA NOT NULL,
  enviado_por BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anexos_demandas_demanda
  ON anexos_demandas_municipais(demanda_id, criado_em);
