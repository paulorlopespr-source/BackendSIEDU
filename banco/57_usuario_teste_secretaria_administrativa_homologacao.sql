DO $$
DECLARE
  ambiente TEXT := LOWER(COALESCE(current_setting('siedu.environment', TRUE), ''));
  usuario_id INTEGER;
BEGIN
  IF ambiente NOT IN ('homologacao', 'homologation') THEN
    RAISE NOTICE 'Conta técnica não criada: ambiente % não é homologação.', ambiente;
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

  INSERT INTO historico_permissoes
    (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
  SELECT u.id, u.tipo_usuario_id, ARRAY[]::INTEGER[], 'ativo',
    'reativacao_teste_secretaria_administrativa_homologacao', NULL
  FROM usuarios u
  WHERE u.id = usuario_id
    AND NOT EXISTS (
      SELECT 1 FROM historico_permissoes h
      WHERE h.usuario_id = u.id
        AND h.acao = 'reativacao_teste_secretaria_administrativa_homologacao'
    );
END $$;
