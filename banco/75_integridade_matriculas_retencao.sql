CREATE OR REPLACE FUNCTION validar_integridade_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  turma_escola_id INTEGER;
  turma_ano_letivo INTEGER;
BEGIN
  SELECT escola_id, ano_letivo
    INTO turma_escola_id, turma_ano_letivo
  FROM turmas
  WHERE id = NEW.turma_id;

  IF turma_escola_id IS NULL THEN
    RAISE EXCEPTION 'Turma não encontrada para a matrícula.';
  END IF;
  IF turma_escola_id <> NEW.escola_id THEN
    RAISE EXCEPTION 'A turma e a matrícula devem pertencer à mesma escola.';
  END IF;
  IF turma_ano_letivo <> NEW.ano_letivo THEN
    RAISE EXCEPTION 'A turma e a matrícula devem pertencer ao mesmo ano letivo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_integridade_matricula ON matriculas;
CREATE TRIGGER trg_validar_integridade_matricula
BEFORE INSERT OR UPDATE OF escola_id, turma_id, ano_letivo ON matriculas
FOR EACH ROW EXECUTE FUNCTION validar_integridade_matricula();

CREATE INDEX IF NOT EXISTS idx_recuperacoes_senha_retencao
  ON recuperacoes_senha(expira_em, utilizado_em);

CREATE INDEX IF NOT EXISTS idx_fila_emails_retencao
  ON fila_emails_sistema(criado_em, status);

COMMENT ON TABLE auditoria_sistema IS
  'Trilha de auditoria imutável. A retenção deve ser definida pela controladoria e executada somente após backup verificável.';

