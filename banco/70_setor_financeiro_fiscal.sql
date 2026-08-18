INSERT INTO tipos_usuarios (nome,nivel,grupo,escopo_acesso,requer_escola,acesso_sistema,descricao)
SELECT 'Setor Financeiro e Fiscal da Educação',3,'Gestão financeira','municipal_total',FALSE,TRUE,
       'Execução orçamentária, fiscalização, prestação de contas e auditoria da Educação'
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_usuarios WHERE nome='Setor Financeiro e Fiscal da Educação'
);

UPDATE tipos_usuarios
SET nivel=3,grupo='Gestão financeira',escopo_acesso='municipal_total',
    requer_escola=FALSE,acesso_sistema=TRUE,
    descricao='Execução orçamentária, fiscalização, prestação de contas e auditoria da Educação'
WHERE nome='Setor Financeiro e Fiscal da Educação';

DO $$
DECLARE
  ambiente TEXT := LOWER(COALESCE(current_setting('siedu.environment', TRUE), ''));
  railway_environment_id TEXT := COALESCE(current_setting('siedu.railway_environment_id', TRUE), '');
  homologacao_id CONSTANT TEXT := '40bd8d52-5ab1-4e18-ba6f-1e641f89e489';
  perfil_id INTEGER;
  conta_id INTEGER;
BEGIN
  IF railway_environment_id <> homologacao_id
     AND ambiente NOT IN ('homologacao','homologation','homologação') THEN
    RAISE NOTICE 'Conta financeira de teste ignorada fora da homologação.';
    RETURN;
  END IF;

  SELECT id INTO perfil_id FROM tipos_usuarios
  WHERE nome='Setor Financeiro e Fiscal da Educação' ORDER BY id LIMIT 1;

  INSERT INTO usuarios (
    nome,cpf,email,senha_hash,tipo_usuario_id,escola_id,ativo,usuario,
    deve_alterar_senha,matricula_funcional,cargo,funcao_exercida,tipo_vinculo,
    situacao_funcional,data_admissao,carga_horaria_semanal,turnos_trabalho,
    secretaria_setor,situacao_acesso,dois_fatores_obrigatorio,dois_fatores_ativo,
    termos_aceitos_em
  ) VALUES (
    'Setor Financeiro e Fiscal - Teste','70000000070','financeiro.teste@siedu.local',
    '$2b$12$RO7KpNHKOjrVG0.bVIplOuMib7zxNMH8y2bSVdII8uJS4NSVb7mnS',perfil_id,NULL,TRUE,'teste.FIN',
    FALSE,'TESTE-FIN-001','Técnico Financeiro e Fiscal','Gestão Financeira Municipal','efetivo',
    'ativo',DATE '2026-08-17',40,ARRAY['integral']::TEXT[],
    'Setor Financeiro e Fiscal da Educação','ativo',FALSE,FALSE,NOW()
  )
  ON CONFLICT (cpf) DO UPDATE SET
    nome=EXCLUDED.nome,email=EXCLUDED.email,senha_hash=EXCLUDED.senha_hash,
    tipo_usuario_id=EXCLUDED.tipo_usuario_id,usuario=EXCLUDED.usuario,ativo=TRUE,
    deve_alterar_senha=FALSE,situacao_funcional='ativo',situacao_acesso='ativo',
    termos_aceitos_em=COALESCE(usuarios.termos_aceitos_em,NOW()),atualizado_em=NOW()
  RETURNING id INTO conta_id;

  IF conta_id IS NULL THEN
    SELECT id INTO conta_id FROM usuarios WHERE cpf='70000000070';
  END IF;

  INSERT INTO historico_permissoes
    (usuario_id,tipo_usuario_id,escolas_ids,situacao_acesso,acao,realizado_por)
  SELECT conta_id,perfil_id,ARRAY[]::INTEGER[],'ativo','cadastro_teste_financeiro_homologacao',NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM historico_permissoes
    WHERE usuario_id=conta_id AND acao='cadastro_teste_financeiro_homologacao'
  );
END $$;
