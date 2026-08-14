-- Fluxo: Direção Escolar -> Secretaria de Educação -> Secretaria Administrativa.
ALTER TABLE demandas_municipais
  DROP CONSTRAINT IF EXISTS demandas_municipais_prioridade_check,
  DROP CONSTRAINT IF EXISTS demandas_municipais_status_check;

UPDATE demandas_municipais
SET prioridade = CASE
  WHEN prioridade IN ('Urgente', 'Alta') THEN 'Alta'
  WHEN prioridade = 'Baixa' THEN 'Baixa'
  ELSE 'Normal'
END;

UPDATE demandas_municipais
SET status = CASE status
  WHEN 'Aberta' THEN 'Enviada à Secretaria'
  WHEN 'Em andamento' THEN 'Em análise pela Secretaria'
  WHEN 'Aguardando escola' THEN 'Pendente na Secretaria'
  WHEN 'Aguardando Secretaria' THEN 'Pendente na Secretaria'
  WHEN 'Concluída' THEN 'Demanda resolvida'
  WHEN 'Cancelada' THEN 'Pendente na Secretaria'
  ELSE status
END;

ALTER TABLE demandas_municipais
  ALTER COLUMN prioridade SET DEFAULT 'Normal',
  ALTER COLUMN status SET DEFAULT 'Enviada à Secretaria',
  ADD COLUMN IF NOT EXISTS autorizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autorizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;

ALTER TABLE demandas_municipais
  ADD CONSTRAINT demandas_municipais_prioridade_check
    CHECK (prioridade IN ('Baixa', 'Normal', 'Alta')),
  ADD CONSTRAINT demandas_municipais_status_check
    CHECK (status IN (
      'Enviada à Secretaria',
      'Em análise pela Secretaria',
      'Pendente na Secretaria',
      'Autorizada para execução',
      'Pendente na Administração',
      'Demanda resolvida'
    ));

CREATE TABLE IF NOT EXISTS notificacoes_demandas (
  id BIGSERIAL PRIMARY KEY,
  demanda_id BIGINT NOT NULL REFERENCES demandas_municipais(id) ON DELETE CASCADE,
  destinatario_setor VARCHAR(50) NOT NULL
    CHECK (destinatario_setor IN ('Secretaria de Educação', 'Secretaria Administrativa', 'Direção Escolar')),
  escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
  titulo VARCHAR(180) NOT NULL,
  mensagem TEXT NOT NULL,
  cor VARCHAR(20) NOT NULL DEFAULT 'cinza'
    CHECK (cor IN ('vermelho', 'verde', 'cinza')),
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_demandas_setor
  ON notificacoes_demandas(destinatario_setor, lida_em, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_demandas_escola
  ON notificacoes_demandas(escola_id, criado_em DESC);
