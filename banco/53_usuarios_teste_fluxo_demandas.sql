-- Contas técnicas exclusivas para validar o fluxo de demandas em produção.
WITH perfis AS (
  SELECT id, nome FROM tipos_usuarios
  WHERE nome IN ('Diretor', 'Secretário Municipal de Educação', 'Técnico da Secretaria de Educação')
), escola AS (
  SELECT id FROM escolas ORDER BY id LIMIT 1
)
INSERT INTO usuarios (
  nome, cpf, email, senha_hash, tipo_usuario_id, escola_id, ativo, usuario,
  deve_alterar_senha, matricula_funcional, cargo, funcao_exercida, tipo_vinculo,
  situacao_funcional, data_admissao, carga_horaria_semanal, turnos_trabalho,
  secretaria_setor, situacao_acesso, dois_fatores_obrigatorio, dois_fatores_ativo
)
SELECT dados.nome, dados.cpf, dados.email,
  '$2b$12$2l6lfK92hAVl4Cmu5j.7zuPZMuRChYBtlnmeEZ88joj6GGEzsaPRy',
  perfis.id, CASE WHEN perfis.nome = 'Diretor' THEN escola.id ELSE NULL END,
  TRUE, dados.usuario, FALSE, dados.matricula, dados.cargo, dados.funcao,
  'temporario', 'ativo', DATE '2026-08-14', 40, ARRAY['integral']::TEXT[],
  dados.setor, 'ativo', FALSE, FALSE
FROM (VALUES
  ('Diretor - Teste de Demandas', '74185296355', 'teste.fluxo.diretor@siedu.local',
   'teste.fluxo.diretor', 'TESTE-FLUXO-DIR', 'Diretor', 'Direção Escolar',
   'Unidade Escolar', 'Diretor'),
  ('Secretaria de Educação - Teste de Demandas', '96325874137', 'teste.fluxo.secretaria@siedu.local',
   'teste.fluxo.secretaria', 'TESTE-FLUXO-SEC', 'Secretário Municipal de Educação',
   'Gestão Municipal', 'Secretaria Municipal de Educação', 'Secretário Municipal de Educação'),
  ('Administração - Teste de Demandas', '85274196373', 'teste.fluxo.administracao@siedu.local',
   'teste.fluxo.administracao', 'TESTE-FLUXO-ADM', 'Técnico da Secretaria de Educação',
   'Execução Administrativa', 'Secretaria Administrativa da Educação', 'Técnico da Secretaria de Educação')
) AS dados(nome, cpf, email, usuario, matricula, cargo, funcao, setor, perfil)
JOIN perfis ON perfis.nome = dados.perfil
CROSS JOIN escola
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios u
  WHERE LOWER(u.usuario) = LOWER(dados.usuario)
     OR u.cpf = dados.cpf
     OR LOWER(u.email) = LOWER(dados.email)
     OR LOWER(u.matricula_funcional) = LOWER(dados.matricula)
);

INSERT INTO usuario_escolas(usuario_id, escola_id)
SELECT u.id, u.escola_id FROM usuarios u
WHERE u.usuario = 'teste.fluxo.diretor' AND u.escola_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO historico_permissoes
  (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
SELECT u.id, u.tipo_usuario_id,
  CASE WHEN u.escola_id IS NULL THEN ARRAY[]::INTEGER[] ELSE ARRAY[u.escola_id]::INTEGER[] END,
  'ativo', 'cadastro_teste_fluxo_demandas', NULL
FROM usuarios u
WHERE u.usuario IN ('teste.fluxo.diretor', 'teste.fluxo.secretaria', 'teste.fluxo.administracao')
  AND NOT EXISTS (
    SELECT 1 FROM historico_permissoes h
    WHERE h.usuario_id = u.id AND h.acao = 'cadastro_teste_fluxo_demandas'
  );
