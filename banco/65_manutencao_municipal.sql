CREATE TABLE IF NOT EXISTS ordens_manutencao (
  id BIGSERIAL PRIMARY KEY,
  protocolo VARCHAR(40) NOT NULL UNIQUE,
  origem VARCHAR(30) NOT NULL CHECK (origem IN ('Escola','Equipamento','Patrimônio','Veículo')),
  escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
  bem_id BIGINT REFERENCES bens_patrimoniais(id) ON DELETE SET NULL,
  veiculo_id INTEGER REFERENCES veiculos_transporte(id) ON DELETE SET NULL,
  demanda_id BIGINT REFERENCES demandas_municipais(id) ON DELETE SET NULL,
  item_local VARCHAR(255) NOT NULL,
  problema TEXT NOT NULL,
  prioridade VARCHAR(20) NOT NULL CHECK (prioridade IN ('Baixa','Normal','Alta','Urgente')),
  status VARCHAR(40) NOT NULL DEFAULT 'Solicitação' CHECK (status IN ('Solicitação','Triagem','Atribuída','Em execução','Aguardando comprovação','Concluída','Cancelada')),
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  prazo DATE,
  custo NUMERIC(14,2) CHECK (custo IS NULL OR custo >= 0),
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS anexos_ordens_manutencao (
  id BIGSERIAL PRIMARY KEY,
  ordem_id BIGINT NOT NULL REFERENCES ordens_manutencao(id) ON DELETE CASCADE,
  etapa VARCHAR(30) NOT NULL CHECK (etapa IN ('Solicitação','Antes','Depois','Comprovação')),
  nome VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  tamanho INTEGER NOT NULL,
  conteudo BYTEA NOT NULL,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_ordens_manutencao (
  id BIGSERIAL PRIMARY KEY,
  ordem_id BIGINT NOT NULL REFERENCES ordens_manutencao(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status_anterior VARCHAR(40),
  status_novo VARCHAR(40) NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ordens_manutencao_status_idx ON ordens_manutencao(status, prioridade, prazo);
CREATE INDEX IF NOT EXISTS ordens_manutencao_escola_idx ON ordens_manutencao(escola_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS anexos_ordens_manutencao_ordem_idx ON anexos_ordens_manutencao(ordem_id, etapa);
