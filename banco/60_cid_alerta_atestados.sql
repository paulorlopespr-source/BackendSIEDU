ALTER TABLE afastamentos_funcionais
  ADD COLUMN IF NOT EXISTS cid_sid VARCHAR(20),
  ADD COLUMN IF NOT EXISTS alerta_secretaria_emitido_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS afastamentos_alerta_secretaria_idx
  ON afastamentos_funcionais(alerta_secretaria_emitido_em DESC)
  WHERE alerta_secretaria_emitido_em IS NOT NULL AND status='confirmado';
