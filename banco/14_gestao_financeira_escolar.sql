ALTER TABLE alocacoes_recursos_escolares
  ADD COLUMN IF NOT EXISTS origem VARCHAR(120),
  ADD COLUMN IF NOT EXISTS finalidade TEXT,
  ADD COLUMN IF NOT EXISTS data_recebimento DATE,
  ADD COLUMN IF NOT EXISTS competencia VARCHAR(7);

CREATE TABLE IF NOT EXISTS lancamentos_financeiros_escolares (
  id SERIAL PRIMARY KEY,
  alocacao_id INTEGER NOT NULL
    REFERENCES alocacoes_recursos_escolares(id),
  escola_id INTEGER NOT NULL
    REFERENCES escolas(id),
  tipo VARCHAR(30) NOT NULL
    CHECK (tipo IN ('Despesa', 'Manutencao', 'Merenda Escolar')),
  categoria VARCHAR(100) NOT NULL,
  descricao TEXT NOT NULL,
  fornecedor VARCHAR(160) NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_lancamento DATE NOT NULL,
  numero_nota_fiscal VARCHAR(80) NOT NULL,
  comprovante_arquivo TEXT NOT NULL,
  criado_por INTEGER NOT NULL
    REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prestacoes_contas_escolares (
  id SERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL
    REFERENCES escolas(id),
  categoria VARCHAR(30) NOT NULL
    CHECK (categoria IN ('Financeiro', 'Merenda Escolar')),
  competencia VARCHAR(7) NOT NULL,
  observacoes TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Enviada'
    CHECK (status IN ('Em elaboracao', 'Enviada', 'Aprovada', 'Com pendencia', 'Reuniao solicitada')),
  enviada_por INTEGER NOT NULL
    REFERENCES usuarios(id),
  enviada_em TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (escola_id, categoria, competencia)
);

CREATE INDEX IF NOT EXISTS idx_alocacoes_escola
  ON alocacoes_recursos_escolares(escola_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_alocacao
  ON lancamentos_financeiros_escolares(alocacao_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_escola
  ON lancamentos_financeiros_escolares(escola_id);

CREATE INDEX IF NOT EXISTS idx_prestacoes_escola
  ON prestacoes_contas_escolares(escola_id);

CREATE OR REPLACE FUNCTION proteger_registro_financeiro()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Registros financeiros e seus valores são imutáveis.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_alocacao_financeira
  ON alocacoes_recursos_escolares;

CREATE TRIGGER trg_proteger_alocacao_financeira
BEFORE UPDATE OF escola_id, categoria, valor_alocado
OR DELETE ON alocacoes_recursos_escolares
FOR EACH ROW EXECUTE FUNCTION proteger_registro_financeiro();

DROP TRIGGER IF EXISTS trg_proteger_lancamento_financeiro
  ON lancamentos_financeiros_escolares;

CREATE TRIGGER trg_proteger_lancamento_financeiro
BEFORE UPDATE OR DELETE ON lancamentos_financeiros_escolares
FOR EACH ROW EXECUTE FUNCTION proteger_registro_financeiro();
