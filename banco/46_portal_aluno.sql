-- Portal do Aluno: vínculo exclusivo usuário/aluno, notificações e dados de demonstração.

INSERT INTO tipos_usuarios (
  nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema, descricao
)
SELECT
  'Aluno', 7, 'Comunidade escolar', 'proprio_aluno', TRUE, TRUE,
  'Acesso exclusivo aos próprios dados acadêmicos'
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_usuarios WHERE LOWER(nome) = LOWER('Aluno')
);

UPDATE tipos_usuarios
SET nivel = 7,
    grupo = 'Comunidade escolar',
    escopo_acesso = 'proprio_aluno',
    requer_escola = TRUE,
    acesso_sistema = TRUE,
    descricao = 'Acesso exclusivo aos próprios dados acadêmicos'
WHERE LOWER(nome) = LOWER('Aluno');

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_alunos_usuario
  ON alunos(usuario_id)
  WHERE usuario_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notificacoes_alunos (
  id BIGSERIAL PRIMARY KEY,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  titulo VARCHAR(180) NOT NULL,
  mensagem TEXT NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'Informação',
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_notificacao_aluno_tipo
    CHECK (tipo IN ('Informação', 'Atividade', 'Avaliação', 'Nota', 'Frequência', 'Calendário'))
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_aluno
  ON notificacoes_alunos(aluno_id, lida, criado_em DESC);

DO $$
DECLARE
  v_tipo INTEGER;
  v_usuario BIGINT;
  v_aluno BIGINT;
  v_escola INTEGER;
  v_turma BIGINT;
  v_professor BIGINT;
  v_disciplina VARCHAR(120);
  v_avaliacao BIGINT;
  v_diario BIGINT;
BEGIN
  SELECT id INTO v_tipo
  FROM tipos_usuarios
  WHERE LOWER(nome) = LOWER('Aluno')
  ORDER BY id
  LIMIT 1;

  SELECT m.escola_id, m.turma_id, m.aluno_id
  INTO v_escola, v_turma, v_aluno
  FROM matriculas m
  JOIN alunos a ON a.id = m.aluno_id
  WHERE a.nome_completo = 'Ana Clara Souza'
    AND m.status = 'Ativa'
  ORDER BY m.ano_letivo DESC, m.id DESC
  LIMIT 1;

  IF v_aluno IS NULL THEN
    SELECT t.escola_id, t.id INTO v_escola, v_turma
    FROM turmas t
    WHERE t.status = 'Ativa'
    ORDER BY t.ano_letivo DESC, t.id
    LIMIT 1;

    INSERT INTO alunos (nome_completo, data_nascimento, email, ativo)
    VALUES ('Ana Clara Souza', DATE '2013-03-11', 'ana.aluna@siedu.local', TRUE)
    RETURNING id INTO v_aluno;

    INSERT INTO matriculas (
      numero, aluno_id, escola_id, turma_id, ano_letivo, status
    )
    SELECT NULL, v_aluno, v_escola, v_turma, ano_letivo, 'Ativa'
    FROM turmas WHERE id = v_turma;
  END IF;

  SELECT id INTO v_usuario
  FROM usuarios
  WHERE LOWER(usuario) = LOWER('ana.aluna.2026')
  LIMIT 1;

  IF v_usuario IS NULL THEN
    INSERT INTO usuarios (
      nome, cpf, email, senha_hash, tipo_usuario_id, escola_id, ativo, usuario,
      deve_alterar_senha, situacao_acesso, dois_fatores_obrigatorio,
      dois_fatores_ativo
    ) VALUES (
      'Ana Clara Souza - Aluna de Teste',
      '46813579013',
      'ana.aluna@siedu.local',
      '$2b$12$GjipzWvFpxqrBpjKGMwGYepOmzGuKIVjYxXl/C0pvjGH2K3fJQXrG',
      v_tipo,
      v_escola,
      TRUE,
      'ana.aluna.2026',
      FALSE,
      'ativo',
      FALSE,
      FALSE
    ) RETURNING id INTO v_usuario;
  END IF;

  UPDATE alunos
  SET usuario_id = v_usuario,
      email = COALESCE(email, 'ana.aluna@siedu.local'),
      atualizado_em = NOW()
  WHERE id = v_aluno;

  SELECT tp.professor_id, tp.componente_curricular
  INTO v_professor, v_disciplina
  FROM turma_professores tp
  WHERE tp.turma_id = v_turma
  ORDER BY tp.titular DESC, tp.professor_id
  LIMIT 1;

  IF v_professor IS NOT NULL THEN
    INSERT INTO horarios_professor (
      professor_id, turma_id, componente_curricular, dia_semana,
      hora_inicio, hora_fim, sala
    ) VALUES
      (v_professor, v_turma, v_disciplina, 2, TIME '08:00', TIME '08:50', '07'),
      (v_professor, v_turma, v_disciplina, 4, TIME '09:40', TIME '10:30', '07')
    ON CONFLICT DO NOTHING;

    INSERT INTO materiais_aula (
      professor_id, turma_id, componente_curricular, titulo, tipo,
      descricao, conteudo_texto, arquivo_dados, arquivo_nome, arquivo_mime
    )
    SELECT
      v_professor, v_turma, v_disciplina,
      'Guia de estudos — Frações', 'Documento',
      'Resumo para consulta e revisão antes da próxima avaliação.',
      'Revise equivalência, simplificação e operações com frações.',
      'data:text/plain;base64,UmV2aXNlIGVxdWl2YWzDqm5jaWEsIHNpbXBsaWZpY2HDp8OjbyBlIG9wZXJhw6fDtWVzIGNvbSBmcmHDp8O1ZXMu',
      'guia-fracoes.txt', 'text/plain'
    WHERE NOT EXISTS (
      SELECT 1 FROM materiais_aula
      WHERE turma_id = v_turma AND titulo = 'Guia de estudos — Frações'
    );

    INSERT INTO atividades_programadas (
      professor_id, turma_id, componente_curricular, tipo, titulo,
      descricao, data_evento, hora_inicio, hora_fim, valor,
      instrucoes, materiais, status
    )
    SELECT
      v_professor, v_turma, v_disciplina, 'Trabalho',
      'Trabalho de revisão — Frações',
      'Resolver os exercícios indicados e apresentar os cálculos.',
      CURRENT_DATE + 7, TIME '08:00', TIME '08:50', 2.0,
      'Entregar identificado com nome e turma.', 'Caderno e guia de estudos',
      'Programada'
    WHERE NOT EXISTS (
      SELECT 1 FROM atividades_programadas
      WHERE turma_id = v_turma AND titulo = 'Trabalho de revisão — Frações'
    );

    INSERT INTO avaliacoes_professor (
      turma_id, professor_id, componente_curricular, titulo, tipo,
      data_avaliacao, valor_maximo, bimestre
    ) VALUES (
      v_turma, v_professor, v_disciplina,
      'Avaliação diagnóstica', 'Prova', CURRENT_DATE - 10, 10, 3
    )
    ON CONFLICT (turma_id, professor_id, componente_curricular, titulo, bimestre)
    DO UPDATE SET data_avaliacao = EXCLUDED.data_avaliacao
    RETURNING id INTO v_avaliacao;

    INSERT INTO notas_avaliacoes (avaliacao_id, aluno_id, pontos)
    VALUES (v_avaliacao, v_aluno, 8.5)
    ON CONFLICT (avaliacao_id, aluno_id)
    DO UPDATE SET pontos = EXCLUDED.pontos, atualizado_em = NOW();

    INSERT INTO diarios_classe (
      turma_id, professor_id, componente_curricular, data_aula,
      quantidade_aulas, conteudo, metodologia
    ) VALUES (
      v_turma, v_professor, v_disciplina, CURRENT_DATE - 2,
      1, 'Operações com frações', 'Exposição dialogada e exercícios'
    )
    ON CONFLICT (turma_id, professor_id, componente_curricular, data_aula)
    DO UPDATE SET conteudo = EXCLUDED.conteudo
    RETURNING id INTO v_diario;

    INSERT INTO diario_frequencias (
      diario_id, aluno_id, presente, justificada, observacao
    ) VALUES (v_diario, v_aluno, TRUE, FALSE, NULL)
    ON CONFLICT (diario_id, aluno_id)
    DO UPDATE SET presente = EXCLUDED.presente, justificada = EXCLUDED.justificada;

    INSERT INTO eventos_calendario_professor (
      professor_id, turma_id, titulo, tipo, data_evento,
      hora_inicio, hora_fim, observacao, publico
    )
    SELECT
      v_professor, v_turma, 'Reunião de acompanhamento da turma',
      'Reunião', CURRENT_DATE + 14, TIME '09:00', TIME '10:00',
      'Evento visível para todos os alunos da turma.', 'Toda a turma'
    WHERE NOT EXISTS (
      SELECT 1 FROM eventos_calendario_professor
      WHERE turma_id = v_turma
        AND titulo = 'Reunião de acompanhamento da turma'
    );
  END IF;

  INSERT INTO notificacoes_alunos (aluno_id, titulo, mensagem, tipo)
  SELECT v_aluno, 'Portal do Aluno disponível',
         'Consulte suas disciplinas, notas, frequência e calendário em um só lugar.',
         'Informação'
  WHERE NOT EXISTS (
    SELECT 1 FROM notificacoes_alunos
    WHERE aluno_id = v_aluno AND titulo = 'Portal do Aluno disponível'
  );

  INSERT INTO notificacoes_alunos (aluno_id, titulo, mensagem, tipo)
  SELECT v_aluno, 'Novo material publicado',
         'O guia de estudos sobre frações já está disponível para consulta e download.',
         'Atividade'
  WHERE NOT EXISTS (
    SELECT 1 FROM notificacoes_alunos
    WHERE aluno_id = v_aluno AND titulo = 'Novo material publicado'
  );
END $$;
