CREATE TABLE IF NOT EXISTS resultados_ideb (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
  codigo_inep VARCHAR(20),
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2005 AND 2200),
  etapa VARCHAR(80) NOT NULL,
  valor NUMERIC(4,2) NOT NULL CHECK (valor BETWEEN 0 AND 10),
  meta NUMERIC(4,2) CHECK (meta BETWEEN 0 AND 10),
  taxa_aprovacao NUMERIC(5,2) CHECK (taxa_aprovacao BETWEEN 0 AND 100),
  aprendizado_portugues NUMERIC(6,2),
  aprendizado_matematica NUMERIC(6,2),
  fonte VARCHAR(180) NOT NULL DEFAULT 'INEP/MEC',
  fonte_url TEXT,
  importado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resultados_ideb_escola_ano_etapa
  ON resultados_ideb(COALESCE(escola_id, 0), ano, etapa);
CREATE INDEX IF NOT EXISTS idx_resultados_ideb_ano ON resultados_ideb(ano DESC, etapa);

CREATE TABLE IF NOT EXISTS reunioes_municipais (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  tipo VARCHAR(60) NOT NULL,
  escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ,
  local VARCHAR(180),
  link_virtual TEXT,
  pauta TEXT NOT NULL,
  participantes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'Agendada'
    CHECK (status IN ('Agendada', 'Realizada', 'Cancelada')),
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reunioes_municipais_inicio ON reunioes_municipais(inicio DESC);

CREATE TABLE IF NOT EXISTS demandas_municipais (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  titulo VARCHAR(180) NOT NULL,
  categoria VARCHAR(60) NOT NULL,
  descricao TEXT NOT NULL,
  prioridade VARCHAR(20) NOT NULL DEFAULT 'Média'
    CHECK (prioridade IN ('Baixa', 'Média', 'Alta', 'Urgente')),
  status VARCHAR(30) NOT NULL DEFAULT 'Aberta'
    CHECK (status IN ('Aberta', 'Em andamento', 'Aguardando escola', 'Aguardando Secretaria', 'Concluída', 'Cancelada')),
  prazo DATE,
  responsavel_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demandas_municipais_escola_status
  ON demandas_municipais(escola_id, status, prioridade);

CREATE TABLE IF NOT EXISTS historico_demandas_municipais (
  id BIGSERIAL PRIMARY KEY,
  demanda_id BIGINT NOT NULL REFERENCES demandas_municipais(id) ON DELETE CASCADE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30),
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historico_demandas_demanda
  ON historico_demandas_municipais(demanda_id, criado_em DESC);

ALTER TABLE prestacoes_contas_escolares
  ADD COLUMN IF NOT EXISTS parecer TEXT,
  ADD COLUMN IF NOT EXISTS avaliada_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avaliada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_reuniao TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS relatorios_oficiais_emitidos (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(60) NOT NULL,
  formato VARCHAR(10) NOT NULL,
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  emitido_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  emitido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
