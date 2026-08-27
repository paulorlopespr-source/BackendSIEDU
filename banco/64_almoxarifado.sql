CREATE TABLE IF NOT EXISTS produtos_almoxarifado (
  id BIGSERIAL PRIMARY KEY,
  item VARCHAR(180) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  unidade VARCHAR(40) NOT NULL,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  localizacao VARCHAR(180) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitacoes_almoxarifado (
  id BIGSERIAL PRIMARY KEY,
  protocolo VARCHAR(40) NOT NULL UNIQUE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Solicitada' CHECK (status IN ('Solicitada','Em análise','Autorizada','Em separação','Entregue','Confirmada','Rejeitada')),
  justificativa TEXT NOT NULL,
  observacao_administrativa TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entregue_em TIMESTAMPTZ,
  confirmado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS itens_solicitacao_almoxarifado (
  id BIGSERIAL PRIMARY KEY,
  solicitacao_id BIGINT NOT NULL REFERENCES solicitacoes_almoxarifado(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos_almoxarifado(id) ON DELETE RESTRICT,
  quantidade_solicitada NUMERIC(12,2) NOT NULL CHECK (quantidade_solicitada > 0),
  quantidade_autorizada NUMERIC(12,2) CHECK (quantidade_autorizada IS NULL OR quantidade_autorizada >= 0),
  UNIQUE (solicitacao_id, produto_id)
);

CREATE TABLE IF NOT EXISTS movimentacoes_almoxarifado (
  id BIGSERIAL PRIMARY KEY,
  produto_id BIGINT NOT NULL REFERENCES produtos_almoxarifado(id) ON DELETE RESTRICT,
  solicitacao_id BIGINT REFERENCES solicitacoes_almoxarifado(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Entrada','Saída','Ajuste')),
  quantidade NUMERIC(12,2) NOT NULL CHECK (quantidade > 0),
  saldo_anterior NUMERIC(12,2) NOT NULL,
  saldo_posterior NUMERIC(12,2) NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS produtos_almoxarifado_estoque_idx ON produtos_almoxarifado(ativo, quantidade, estoque_minimo);
CREATE INDEX IF NOT EXISTS solicitacoes_almoxarifado_status_idx ON solicitacoes_almoxarifado(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS solicitacoes_almoxarifado_escola_idx ON solicitacoes_almoxarifado(escola_id, criado_em DESC);
