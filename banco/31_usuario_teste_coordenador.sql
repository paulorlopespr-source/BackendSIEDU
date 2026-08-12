WITH perfil AS (
  SELECT id FROM tipos_usuarios
  WHERE nome = 'Coordenador Pedagógico Municipal'
  ORDER BY id LIMIT 1
), novo_usuario AS (
  INSERT INTO usuarios (
    nome, cpf, email, senha_hash, tipo_usuario_id, escola_id, ativo, usuario,
    deve_alterar_senha, matricula_funcional, cargo, funcao_exercida, tipo_vinculo,
    situacao_funcional, data_admissao, carga_horaria_semanal, turnos_trabalho,
    secretaria_setor, situacao_acesso, dois_fatores_obrigatorio, dois_fatores_ativo
  )
  SELECT
    'Larissa Oliveira - Perfil de Teste',
    '24681357900',
    'larissa.coordenacao@siedu.local',
    '$2b$12$GjipzWvFpxqrBpjKGMwGYepOmzGuKIVjYxXl/C0pvjGH2K3fJQXrG',
    perfil.id, NULL, TRUE, 'larissa.coordenacao.2026',
    FALSE, 'TESTE-COORD-001', 'Coordenador Pedagógico Municipal',
    'Coordenação Pedagógica da Rede Municipal', 'comissionado', 'ativo',
    DATE '2026-08-12', 40, ARRAY['integral']::TEXT[],
    'Secretaria Municipal de Educação', 'ativo', TRUE, FALSE
  FROM perfil
  WHERE NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE LOWER(usuario) = LOWER('larissa.coordenacao.2026')
       OR cpf = '24681357900'
       OR LOWER(email) = LOWER('larissa.coordenacao@siedu.local')
       OR LOWER(matricula_funcional) = LOWER('TESTE-COORD-001')
  )
  RETURNING id, tipo_usuario_id
)
INSERT INTO historico_permissoes
  (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
SELECT id, tipo_usuario_id, ARRAY[]::INTEGER[], 'ativo', 'cadastro', NULL
FROM novo_usuario;
