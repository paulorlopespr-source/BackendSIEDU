WITH usuario_teste AS (
 SELECT id FROM usuarios WHERE usuario='carlos.professor.2026' LIMIT 1
), professor_teste AS (
 SELECT p.id,p.usuario_id FROM professores p JOIN usuario_teste u ON u.id=p.usuario_id
), turma_escolhida AS (
 SELECT t.id,t.escola_id FROM turmas t
 LEFT JOIN matriculas m ON m.turma_id=t.id AND m.status='Ativa'
 WHERE t.status='Ativa' GROUP BY t.id,t.escola_id ORDER BY COUNT(m.id) DESC,t.id LIMIT 1
), atualiza_usuario AS (
 UPDATE usuarios u SET escola_id=t.escola_id FROM usuario_teste x CROSS JOIN turma_escolhida t WHERE u.id=x.id RETURNING u.id
), vincula_escola AS (
 INSERT INTO professor_escolas (professor_id,escola_id,tipo_vinculo,carga_horaria_semanal,ativo)
 SELECT p.id,t.escola_id,'Efetivo',40,TRUE FROM professor_teste p CROSS JOIN turma_escolhida t
 ON CONFLICT (professor_id,escola_id) DO UPDATE SET ativo=TRUE RETURNING professor_id
)
INSERT INTO turma_professores (turma_id,professor_id,componente_curricular,carga_horaria_semanal,titular)
SELECT t.id,p.id,'Matemática',8,TRUE FROM turma_escolhida t CROSS JOIN professor_teste p
ON CONFLICT DO NOTHING;
