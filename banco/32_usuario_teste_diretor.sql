WITH perfil AS (
  SELECT id FROM tipos_usuarios WHERE nome = 'Diretor' ORDER BY id LIMIT 1
), escola AS (
  SELECT id FROM escolas ORDER BY id LIMIT 1
), novo_usuario AS (
  INSERT INTO usuarios (
    nome, cpf, email, senha_hash, tipo_usuario_id, escola_id, ativo, usuario,
    deve_alterar_senha, matricula_funcional, cargo, funcao_exercida, tipo_vinculo,
    situacao_funcional, data_admissao, carga_horaria_semanal, turnos_trabalho,
    secretaria_setor, situacao_acesso, dois_fatores_obrigatorio, dois_fatores_ativo
  )
  SELECT
    'Ricardo Santos - Diretor de Teste', '35792468001',
    'ricardo.diretor@siedu.local',
    '$2b$12$GjipzWvFpxqrBpjKGMwGYepOmzGuKIVjYxXl/C0pvjGH2K3fJQXrG',
    perfil.id, escola.id, TRUE, 'ricardo.diretor.2026',
    FALSE, 'TESTE-DIR-001', 'Diretor', 'Direção de Unidade Escolar',
    'comissionado', 'ativo', DATE '2026-08-12', 40,
    ARRAY['integral']::TEXT[], 'Unidade Escolar', 'ativo', TRUE, FALSE
  FROM perfil CROSS JOIN escola
  WHERE NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE LOWER(usuario) = LOWER('ricardo.diretor.2026')
       OR cpf = '35792468001'
       OR LOWER(email) = LOWER('ricardo.diretor@siedu.local')
       OR LOWER(matricula_funcional) = LOWER('TESTE-DIR-001')
  )
  RETURNING id, tipo_usuario_id, escola_id
)
INSERT INTO historico_permissoes
  (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
SELECT id, tipo_usuario_id, ARRAY[escola_id]::INTEGER[], 'ativo', 'cadastro', NULL
FROM novo_usuario;
