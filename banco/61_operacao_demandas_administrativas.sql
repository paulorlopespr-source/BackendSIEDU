ALTER TABLE demandas_municipais
  DROP CONSTRAINT IF EXISTS demandas_municipais_status_check;

ALTER TABLE demandas_municipais
  ADD COLUMN IF NOT EXISTS setor_responsavel VARCHAR(120),
  ADD COLUMN IF NOT EXISTS assumida_em TIMESTAMPTZ,
  ADD CONSTRAINT demandas_municipais_status_check CHECK (status IN (
    'Enviada à Secretaria',
    'Em análise pela Secretaria',
    'Pendente na Secretaria',
    'Autorizada para execução',
    'Pendente na Administração',
    'Em execução',
    'Demanda resolvida'
  ));

CREATE INDEX IF NOT EXISTS demandas_operacao_status_prazo_idx
  ON demandas_municipais(status, prazo, prioridade);
