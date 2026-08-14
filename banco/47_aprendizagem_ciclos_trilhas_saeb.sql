-- Avaliações quinzenais, trilhas de revisão e simulados diagnósticos SAEB.

CREATE TABLE IF NOT EXISTS avaliacoes_ciclo (
  id BIGSERIAL PRIMARY KEY,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  componente_curricular VARCHAR(120) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT,
  instrucoes TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  valor_maximo NUMERIC(7,2) NOT NULL DEFAULT 10,
  ciclo_numero INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'Publicada',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_avaliacao_ciclo_periodo CHECK (
    data_fim >= data_inicio AND data_fim <= data_inicio + 15
  ),
  CONSTRAINT ck_avaliacao_ciclo_valor CHECK (valor_maximo > 0),
  CONSTRAINT ck_avaliacao_ciclo_status CHECK (
    status IN ('Rascunho', 'Publicada', 'Encerrada', 'Cancelada')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_avaliacao_ciclo_turma_numero
  ON avaliacoes_ciclo(turma_id, componente_curricular, ciclo_numero);

CREATE TABLE IF NOT EXISTS resultados_avaliacoes_ciclo (
  id BIGSERIAL PRIMARY KEY,
  avaliacao_ciclo_id BIGINT NOT NULL REFERENCES avaliacoes_ciclo(id) ON DELETE CASCADE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  pontos NUMERIC(7,2),
  feedback TEXT,
  lancado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (avaliacao_ciclo_id, aluno_id),
  CONSTRAINT ck_resultado_ciclo_pontos CHECK (pontos IS NULL OR pontos >= 0)
);

CREATE TABLE IF NOT EXISTS trilhas_revisao (
  id BIGSERIAL PRIMARY KEY,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  componente_curricular VARCHAR(120) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  objetivo TEXT NOT NULL,
  conteudos TEXT NOT NULL,
  exercicios TEXT NOT NULL,
  criterio_resultado VARCHAR(180),
  criado_por BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  perfil_criador VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Publicada',
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_trilha_status CHECK (status IN ('Rascunho', 'Publicada', 'Arquivada'))
);

CREATE TABLE IF NOT EXISTS trilhas_revisao_alunos (
  id BIGSERIAL PRIMARY KEY,
  trilha_id BIGINT NOT NULL REFERENCES trilhas_revisao(id) ON DELETE CASCADE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'Disponível',
  progresso INTEGER NOT NULL DEFAULT 0,
  resultado_observado NUMERIC(7,2),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trilha_id, aluno_id),
  CONSTRAINT ck_trilha_progresso CHECK (progresso BETWEEN 0 AND 100),
  CONSTRAINT ck_trilha_aluno_status CHECK (
    status IN ('Disponível', 'Em andamento', 'Concluída')
  )
);

CREATE TABLE IF NOT EXISTS simulados_saeb (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  ano_letivo INTEGER NOT NULL,
  area_conhecimento VARCHAR(120) NOT NULL,
  matriz_referencia TEXT NOT NULL,
  serie_ano VARCHAR(80),
  turma_id BIGINT REFERENCES turmas(id) ON DELETE CASCADE,
  data_aplicacao DATE NOT NULL,
  hora_inicio TIME,
  duracao_minutos INTEGER NOT NULL DEFAULT 120,
  quantidade_questoes INTEGER NOT NULL,
  instrucoes TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'Programado',
  criado_por BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_simulado_saeb_status CHECK (
    status IN ('Rascunho', 'Programado', 'Em aplicação', 'Encerrado', 'Cancelado')
  ),
  CONSTRAINT ck_simulado_saeb_duracao CHECK (duracao_minutos BETWEEN 15 AND 360),
  CONSTRAINT ck_simulado_saeb_questoes CHECK (quantidade_questoes BETWEEN 1 AND 200)
);

CREATE TABLE IF NOT EXISTS resultados_simulados_saeb (
  id BIGSERIAL PRIMARY KEY,
  simulado_id BIGINT NOT NULL REFERENCES simulados_saeb(id) ON DELETE CASCADE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  acertos INTEGER,
  proficiencia NUMERIC(8,2),
  nivel_desempenho VARCHAR(80),
  finalizado_em TIMESTAMPTZ,
  UNIQUE (simulado_id, aluno_id),
  CONSTRAINT ck_saeb_acertos CHECK (acertos IS NULL OR acertos >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ciclo_turma_data
  ON avaliacoes_ciclo(turma_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_trilha_turma_status
  ON trilhas_revisao(turma_id, status);
CREATE INDEX IF NOT EXISTS idx_saeb_aplicacao
  ON simulados_saeb(data_aplicacao, status);

-- Conteúdo demonstrativo para o usuário de teste, sem duplicação em reexecuções.
DO $$
DECLARE
  v_professor BIGINT;
  v_usuario_professor BIGINT;
  v_turma BIGINT;
  v_aluno BIGINT;
  v_secretario BIGINT;
  v_ciclo BIGINT;
BEGIN
  SELECT p.id, p.usuario_id, tp.turma_id
    INTO v_professor, v_usuario_professor, v_turma
  FROM professores p
  JOIN turma_professores tp ON tp.professor_id = p.id
  JOIN turmas t ON t.id = tp.turma_id
  WHERE p.ativo = TRUE
    AND COALESCE(NULLIF(regexp_replace(t.serie_ano, '\D', '', 'g'), '')::integer, 0) >= 6
  ORDER BY p.id, tp.turma_id
  LIMIT 1;

  SELECT a.id INTO v_aluno
  FROM alunos a
  JOIN matriculas m ON m.aluno_id = a.id
  WHERE m.turma_id = v_turma AND m.status = 'Ativa'
  ORDER BY CASE WHEN a.nome_completo = 'Ana Clara Souza' THEN 0 ELSE 1 END, a.id
  LIMIT 1;

  SELECT u.id INTO v_secretario
  FROM usuarios u
  JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
  WHERE t.nome IN (
    'Secretário Municipal de Educação',
    'Coordenador Pedagógico Municipal',
    'Super Administrador'
  )
  ORDER BY CASE WHEN t.nome = 'Secretário Municipal de Educação' THEN 0 ELSE 1 END, u.id
  LIMIT 1;

  IF v_professor IS NOT NULL AND v_turma IS NOT NULL THEN
    INSERT INTO avaliacoes_ciclo (
      professor_id, turma_id, componente_curricular, titulo, descricao,
      instrucoes, data_inicio, data_fim, valor_maximo, ciclo_numero, status
    )
    SELECT v_professor, v_turma, COALESCE(tp.componente_curricular, 'Matemática'),
      'Avaliação de Ciclo 1', 'Atividade quinzenal de acompanhamento da aprendizagem.',
      'Resolva as questões com atenção e revise antes de entregar.',
      CURRENT_DATE, CURRENT_DATE + 14, 10, 1, 'Publicada'
    FROM turma_professores tp
    WHERE tp.professor_id = v_professor AND tp.turma_id = v_turma
    ORDER BY tp.componente_curricular LIMIT 1
    ON CONFLICT (turma_id, componente_curricular, ciclo_numero) DO NOTHING
    RETURNING id INTO v_ciclo;

    IF v_ciclo IS NULL THEN
      SELECT id INTO v_ciclo FROM avaliacoes_ciclo
      WHERE turma_id = v_turma AND ciclo_numero = 1 ORDER BY id LIMIT 1;
    END IF;

    IF v_ciclo IS NOT NULL AND v_aluno IS NOT NULL THEN
      INSERT INTO resultados_avaliacoes_ciclo (
        avaliacao_ciclo_id, aluno_id, pontos, feedback
      ) VALUES (v_ciclo, v_aluno, 8.5, 'Bom desempenho. Reforce os conteúdos indicados na trilha.')
      ON CONFLICT (avaliacao_ciclo_id, aluno_id) DO NOTHING;
    END IF;

    IF v_usuario_professor IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM trilhas_revisao WHERE turma_id = v_turma AND titulo = 'Trilha de revisão — Ciclo 1'
    ) THEN
      INSERT INTO trilhas_revisao (
        turma_id, componente_curricular, titulo, objetivo, conteudos, exercicios,
        criterio_resultado, criado_por, perfil_criador, status
      )
      SELECT v_turma, COALESCE(tp.componente_curricular, 'Matemática'),
        'Trilha de revisão — Ciclo 1',
        'Consolidar as habilidades que apresentaram maior dificuldade no ciclo.',
        'Revisão orientada, exemplos resolvidos e material complementar.',
        'Exercícios graduados: nível inicial, intermediário e desafio.',
        'Indicada após análise do resultado da Avaliação de Ciclo 1.',
        v_usuario_professor, 'Professor', 'Publicada'
      FROM turma_professores tp
      WHERE tp.professor_id = v_professor AND tp.turma_id = v_turma
      ORDER BY tp.componente_curricular LIMIT 1;
    END IF;
  END IF;

  IF v_secretario IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM simulados_saeb WHERE titulo = 'Simulado SAEB Diagnóstico Municipal 2026'
  ) THEN
    INSERT INTO simulados_saeb (
      titulo, ano_letivo, area_conhecimento, matriz_referencia, serie_ano,
      turma_id, data_aplicacao, hora_inicio, duracao_minutos,
      quantidade_questoes, instrucoes, status, criado_por
    ) VALUES (
      'Simulado SAEB Diagnóstico Municipal 2026', 2026,
      'Língua Portuguesa e Matemática',
      'Matrizes de referência do SAEB — leitura, resolução de problemas e competências essenciais.',
      NULL, NULL, CURRENT_DATE + 21, TIME '08:00', 120, 40,
      'Aplicação definida pela Secretaria Municipal e Coordenação de Ensino.',
      'Programado', v_secretario
    );
  END IF;
END $$;
