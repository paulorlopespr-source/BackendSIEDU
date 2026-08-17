DO $$
DECLARE
  ambiente TEXT := LOWER(COALESCE(current_setting('siedu.environment', TRUE), ''));
  railway_environment_id TEXT := COALESCE(current_setting('siedu.railway_environment_id', TRUE), '');
  homologacao_id CONSTANT TEXT := '40bd8d52-5ab1-4e18-ba6f-1e641f89e489';
  usuario_id INTEGER;
BEGIN
  IF railway_environment_id <> homologacao_id
     AND ambiente NOT IN ('homologacao', 'homologation', 'homologação') THEN
    RAISE NOTICE 'Correção da conta teste.SEC ignorada fora da homologação.';
    RETURN;
  END IF;

  SELECT id INTO usuario_id
  FROM usuarios
  WHERE LOWER(usuario) IN ('teste.sec', 'teste.fluxo.administracao')
  ORDER BY CASE WHEN LOWER(usuario) = 'teste.sec' THEN 0 ELSE 1 END
  LIMIT 1;

  IF usuario_id IS NULL THEN
    RAISE EXCEPTION 'Conta técnica administrativa original não encontrada.';
  END IF;

  UPDATE usuarios
  SET nome = 'Secretaria Administrativa - Teste',
      usuario = 'teste.SEC',
      senha_hash = '$2b$12$RO7KpNHKOjrVG0.bVIplOuMib7zxNMH8y2bSVdII8uJS4NSVb7mnS',
      tipo_usuario_id = COALESCE(
        (SELECT id FROM tipos_usuarios
         WHERE nome = 'Secretaria Administrativa da Educação'
         ORDER BY id LIMIT 1),
        tipo_usuario_id
      ),
      ativo = TRUE,
      situacao_acesso = 'ativo',
      situacao_funcional = 'ativo',
      deve_alterar_senha = TRUE,
      atualizado_em = NOW()
  WHERE id = usuario_id;

  RAISE NOTICE 'Conta teste.SEC corrigida na homologação.';
END $$;
