ALTER TABLE rotas_transporte
  ADD COLUMN IF NOT EXISTS origem VARCHAR(180),
  ADD COLUMN IF NOT EXISTS destino VARCHAR(180),
  ADD COLUMN IF NOT EXISTS horario_saida TIME,
  ADD COLUMN IF NOT EXISTS horario_chegada TIME,
  ADD COLUMN IF NOT EXISTS dias_semana VARCHAR(120),
  ADD COLUMN IF NOT EXISTS pontos_parada JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE veiculos_transporte
  ADD COLUMN IF NOT EXISTS quilometragem INTEGER,
  ADD COLUMN IF NOT EXISTS proxima_manutencao DATE;

CREATE TABLE IF NOT EXISTS alunos_rotas_transporte (
  id SERIAL PRIMARY KEY,
  rota_id INTEGER NOT NULL REFERENCES rotas_transporte(id) ON DELETE CASCADE,
  escola_id INTEGER REFERENCES escolas(id),
  matricula VARCHAR(30) NOT NULL,
  nome VARCHAR(160) NOT NULL,
  turma VARCHAR(80),
  responsavel VARCHAR(160) NOT NULL,
  contato_responsavel VARCHAR(30) NOT NULL,
  ponto_embarque VARCHAR(180) NOT NULL,
  ponto_desembarque VARCHAR(180),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (rota_id, matricula)
);

CREATE TABLE IF NOT EXISTS manutencoes_veiculos_transporte (
  id SERIAL PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos_transporte(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Preventiva', 'Corretiva', 'Inspecao')),
  descricao TEXT NOT NULL,
  itens_servicos TEXT NOT NULL,
  fornecedor VARCHAR(160),
  data_manutencao DATE NOT NULL,
  quilometragem INTEGER,
  valor NUMERIC(12,2) CHECK (valor IS NULL OR valor >= 0),
  numero_nota_fiscal VARCHAR(80),
  comprovante_arquivo TEXT,
  proxima_manutencao DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'Agendada'
    CHECK (status IN ('Agendada', 'Em andamento', 'Concluida', 'Cancelada')),
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alunos_rotas_rota
  ON alunos_rotas_transporte(rota_id);

CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo
  ON manutencoes_veiculos_transporte(veiculo_id);

CREATE INDEX IF NOT EXISTS idx_manutencoes_status
  ON manutencoes_veiculos_transporte(status);
