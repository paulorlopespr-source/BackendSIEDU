DO $$
DECLARE
  ambiente TEXT := LOWER(COALESCE(current_setting('siedu.environment', TRUE), ''));
  railway_environment_id TEXT := COALESCE(current_setting('siedu.railway_environment_id', TRUE), '');
  homologacao_id CONSTANT TEXT := '40bd8d52-5ab1-4e18-ba6f-1e641f89e489';
  perfil_aluno_id BIGINT;
BEGIN
  IF railway_environment_id <> homologacao_id
     AND ambiente NOT IN ('homologacao', 'homologation', 'homologação') THEN
    RAISE NOTICE 'Cadastro de teste de recuperação ignorado fora da homologação.';
    RETURN;
  END IF;

  SELECT id INTO perfil_aluno_id
  FROM tipos_usuarios
  WHERE nome = 'Aluno'
  ORDER BY id
  LIMIT 1;

  IF perfil_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Perfil Aluno não encontrado para criar a conta de teste.';
  END IF;

  INSERT INTO usuarios (
    nome, cpf, email, usuario, senha_hash, tipo_usuario_id, ativo,
    deve_alterar_senha, situacao_funcional, situacao_acesso, termos_aceitos_em
  ) VALUES (
    'Paulo - Teste de E-mail',
    '99999999999',
    'paulolopesjk@hotmail.com',
    'paulo.teste.email',
    '$2b$12$RO7KpNHKOjrVG0.bVIplOuMib7zxNMH8y2bSVdII8uJS4NSVb7mnS',
    perfil_aluno_id,
    TRUE,
    FALSE,
    'ativo',
    'ativo',
    NOW()
  )
  ON CONFLICT (usuario) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    ativo = TRUE,
    situacao_funcional = 'ativo',
    situacao_acesso = 'ativo',
    atualizado_em = NOW();
END $$;

