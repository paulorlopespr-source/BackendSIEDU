DO $$
DECLARE v_usuario BIGINT; v_professor BIGINT; v_escola INTEGER; v_turma BIGINT; v_aluno BIGINT; nomes TEXT[]:=ARRAY['Ana Clara Souza','Bruno Henrique Lima','Mariana Alves Santos']; nome TEXT; idx INTEGER:=0;
BEGIN
 SELECT u.id,u.escola_id INTO v_usuario,v_escola FROM usuarios u WHERE u.usuario='carlos.professor.2026';
 SELECT id INTO v_professor FROM professores WHERE usuario_id=v_usuario;
 IF v_usuario IS NULL OR v_professor IS NULL THEN RAISE EXCEPTION 'Professor de teste não encontrado'; END IF;
 INSERT INTO turmas(escola_id,ano_letivo,nome,etapa_ensino,serie_ano,turno,capacidade,sala,status,criado_por)
 VALUES(v_escola,2026,'7º Ano A - Teste','Ensino Fundamental','7º Ano','Matutino',30,'07','Ativa',v_usuario)
 ON CONFLICT(escola_id,ano_letivo,nome) DO UPDATE SET status='Ativa' RETURNING id INTO v_turma;
 INSERT INTO turma_professores(turma_id,professor_id,componente_curricular,carga_horaria_semanal,titular) VALUES(v_turma,v_professor,'Matemática',8,TRUE) ON CONFLICT DO NOTHING;
 FOREACH nome IN ARRAY nomes LOOP
  idx:=idx+1;
  SELECT id INTO v_aluno FROM alunos WHERE nome_completo=nome LIMIT 1;
  IF v_aluno IS NULL THEN INSERT INTO alunos(nome_completo,data_nascimento,ativo,criado_por) VALUES(nome,DATE '2013-03-10'+idx,TRUE,v_usuario) RETURNING id INTO v_aluno; END IF;
  INSERT INTO matriculas(numero,aluno_id,escola_id,turma_id,ano_letivo,status,criado_por) VALUES(NULL,v_aluno,v_escola,v_turma,2026,'Ativa',v_usuario) ON CONFLICT DO NOTHING;
  INSERT INTO notas_alunos(aluno_id,turma_id,professor_id,componente_curricular,avaliacao,nota,data_avaliacao) SELECT v_aluno,v_turma,v_professor,'Matemática','Avaliação Bimestral',CASE idx WHEN 1 THEN 8.5 WHEN 2 THEN 6.8 ELSE 7.6 END,DATE '2026-07-20' WHERE NOT EXISTS(SELECT 1 FROM notas_alunos WHERE aluno_id=v_aluno AND turma_id=v_turma);
  INSERT INTO faltas_alunos(aluno_id,turma_id,professor_id,componente_curricular,data_aula,quantidade,justificada) SELECT v_aluno,v_turma,v_professor,'Matemática',DATE '2026-08-05',idx,FALSE WHERE NOT EXISTS(SELECT 1 FROM faltas_alunos WHERE aluno_id=v_aluno AND turma_id=v_turma);
  INSERT INTO atividades_alunos(aluno_id,turma_id,professor_id,titulo,prazo,status) SELECT v_aluno,v_turma,v_professor,'Lista de exercícios - Frações',DATE '2026-08-20',CASE WHEN idx=1 THEN 'Entregue' ELSE 'Pendente' END WHERE NOT EXISTS(SELECT 1 FROM atividades_alunos WHERE aluno_id=v_aluno AND turma_id=v_turma);
 END LOOP;
END $$;
