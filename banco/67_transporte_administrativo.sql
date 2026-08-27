ALTER TABLE veiculos_transporte
  ADD COLUMN IF NOT EXISTS documento_veiculo VARCHAR(120),
  ADD COLUMN IF NOT EXISTS validade_documento DATE;

ALTER TABLE motoristas_transporte
  ADD COLUMN IF NOT EXISTS categoria_cnh VARCHAR(10);

CREATE TABLE IF NOT EXISTS rotas_escolas_transporte (
  rota_id INTEGER NOT NULL REFERENCES rotas_transporte(id) ON DELETE CASCADE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rota_id, escola_id)
);

INSERT INTO rotas_escolas_transporte(rota_id,escola_id)
SELECT DISTINCT rota_id,escola_id FROM alunos_rotas_transporte
WHERE escola_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS rotas_escolas_transporte_escola_idx ON rotas_escolas_transporte(escola_id,rota_id);
