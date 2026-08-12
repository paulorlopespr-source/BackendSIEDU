WITH perfil AS (SELECT id FROM tipos_usuarios WHERE nome='Professor' ORDER BY id LIMIT 1),
escola AS (SELECT id FROM escolas ORDER BY id LIMIT 1),
novo AS (
 INSERT INTO usuarios (nome,cpf,email,senha_hash,tipo_usuario_id,escola_id,ativo,usuario,deve_alterar_senha,matricula_funcional,cargo,funcao_exercida,tipo_vinculo,situacao_funcional,data_admissao,carga_horaria_semanal,turnos_trabalho,secretaria_setor,situacao_acesso,dois_fatores_obrigatorio,dois_fatores_ativo)
 SELECT 'Carlos Alberto - Professor de Teste','46813579002','carlos.professor@siedu.local','$2b$12$GjipzWvFpxqrBpjKGMwGYepOmzGuKIVjYxXl/C0pvjGH2K3fJQXrG',perfil.id,escola.id,TRUE,'carlos.professor.2026',FALSE,'TESTE-PROF-001','Professor','Docência em Matemática','efetivo','ativo',DATE '2026-08-12',40,ARRAY['matutino','vespertino']::TEXT[],'Unidade Escolar','ativo',FALSE,FALSE
 FROM perfil CROSS JOIN escola WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario='carlos.professor.2026' OR cpf='46813579002')
 RETURNING id,escola_id,tipo_usuario_id
), usuario_teste AS (
 SELECT id,escola_id,tipo_usuario_id FROM novo UNION ALL
 SELECT u.id,u.escola_id,u.tipo_usuario_id FROM usuarios u WHERE u.usuario='carlos.professor.2026' LIMIT 1
), professor AS (
 INSERT INTO professores (usuario_id,nome_completo,cpf,email,matricula_funcional,formacao,especialidade,ativo)
 SELECT id,'Carlos Alberto - Professor de Teste','46813579002','carlos.professor@siedu.local','TESTE-PROF-001','Licenciatura em Matemática','Matemática',TRUE FROM usuario_teste
 ON CONFLICT (usuario_id) DO UPDATE SET ativo=TRUE RETURNING id,usuario_id
), vinculo AS (
 INSERT INTO professor_escolas (professor_id,escola_id,tipo_vinculo,carga_horaria_semanal,ativo)
 SELECT professor.id,usuario_teste.escola_id,'Efetivo',40,TRUE FROM professor JOIN usuario_teste ON usuario_teste.id=professor.usuario_id
 ON CONFLICT (professor_id,escola_id) DO UPDATE SET ativo=TRUE RETURNING professor_id,escola_id
)
INSERT INTO turma_professores (turma_id,professor_id,componente_curricular,carga_horaria_semanal,titular)
SELECT t.id,v.professor_id,'Matemática',8,TRUE FROM vinculo v JOIN LATERAL (SELECT id FROM turmas WHERE escola_id=v.escola_id AND status='Ativa' ORDER BY id LIMIT 1) t ON TRUE
ON CONFLICT DO NOTHING;
