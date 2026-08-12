WITH perfil AS (
  SELECT id
  FROM tipos_usuarios
  WHERE nome = 'Secretário Municipal de Educação'
  ORDER BY id
  LIMIT 1
), novo_usuario AS (
  INSERT INTO usuarios (
    nome, cpf, email, senha_hash, tipo_usuario_id, escola_id, ativo, usuario,
    deve_alterar_senha, matricula_funcional, cargo, funcao_exercida, tipo_vinculo,
    situacao_funcional, data_admissao, carga_horaria_semanal, turnos_trabalho,
    secretaria_setor, situacao_acesso, dois_fatores_obrigatorio, dois_fatores_ativo
  )
  SELECT
    'Mariana Souza - Perfil de Teste',
    '52998224725',
    'teste.secretaria@siedu.local',
    '$2b$12$GjipzWvFpxqrBpjKGMwGYepOmzGuKIVjYxXl/C0pvjGH2K3fJQXrG',
    perfil.id,
    NULL,
    TRUE,
    'teste.secretaria.2026',
    FALSE,
    'TESTE-SEC-001',
    'Secretária Municipal de Educação',
    'Gestora Municipal da Rede de Ensino',
    'comissionado',
    'ativo',
    DATE '2026-08-12',
    40,
    ARRAY['integral']::TEXT[],
    'Secretaria Municipal de Educação',
    'ativo',
    TRUE,
    FALSE
  FROM perfil
  WHERE NOT EXISTS (
    SELECT 1
    FROM usuarios
    WHERE LOWER(usuario) = LOWER('teste.secretaria.2026')
       OR cpf = '52998224725'
       OR LOWER(email) = LOWER('teste.secretaria@siedu.local')
       OR LOWER(matricula_funcional) = LOWER('TESTE-SEC-001')
  )
  RETURNING id, tipo_usuario_id
)
INSERT INTO historico_permissoes
  (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
SELECT id, tipo_usuario_id, ARRAY[]::INTEGER[], 'ativo', 'cadastro', NULL
FROM novo_usuario;
