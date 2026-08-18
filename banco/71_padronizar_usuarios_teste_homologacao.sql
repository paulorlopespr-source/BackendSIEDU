DO $$
DECLARE
  ambiente TEXT := LOWER(COALESCE(current_setting('siedu.environment', TRUE), ''));
  railway_environment_id TEXT := COALESCE(current_setting('siedu.railway_environment_id', TRUE), '');
  homologacao_id CONSTANT TEXT := '40bd8d52-5ab1-4e18-ba6f-1e641f89e489';
  atualizados INTEGER;
BEGIN
  IF railway_environment_id <> homologacao_id
     AND ambiente NOT IN ('homologacao', 'homologation', 'homologação') THEN
    RAISE NOTICE 'Padronização das contas de teste ignorada fora da homologação.';
    RETURN;
  END IF;

  UPDATE usuarios
  SET senha_hash = '$2b$12$RO7KpNHKOjrVG0.bVIplOuMib7zxNMH8y2bSVdII8uJS4NSVb7mnS',
      ativo = TRUE,
      situacao_acesso = 'ativo',
      situacao_funcional = COALESCE(situacao_funcional, 'ativo'),
      deve_alterar_senha = FALSE,
      termos_aceitos_em = COALESCE(termos_aceitos_em, NOW()),
      atualizado_em = NOW()
  WHERE LOWER(usuario) = ANY(ARRAY[
    'teste.secretaria.2026',
    'caio.superintendente.2026',
    'larissa.coordenacao.2026',
    'ricardo.diretor.2026',
    'carlos.professor.2026',
    'ana.aluna.2026',
    'teste.sec',
    'teste.fin'
  ]::TEXT[]);

  GET DIAGNOSTICS atualizados = ROW_COUNT;
  RAISE NOTICE '% contas de teste padronizadas na homologação.', atualizados;
END $$;
