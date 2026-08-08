-- Núcleo acadêmico do SIEPIN.
-- Estrutura idempotente: pode ser aplicada mais de uma vez sem apagar dados.

CREATE TABLE IF NOT EXISTS alunos (
  id BIGSERIAL PRIMARY KEY,
  nome_completo VARCHAR(180) NOT NULL,
  nome_social VARCHAR(180),
  data_nascimento DATE NOT NULL,
  cpf VARCHAR(11),
  rg VARCHAR(30),
  certidao_nascimento VARCHAR(80),
  genero VARCHAR(30),
  nacionalidade VARCHAR(80) DEFAULT 'Brasileira',
  naturalidade VARCHAR(120),
  necessidade_educacional_especial BOOLEAN NOT NULL DEFAULT FALSE,
  descricao_necessidade TEXT,
  telefone VARCHAR(30),
  email VARCHAR(180),
  cep VARCHAR(9),
  logradouro VARCHAR(180),
  numero_endereco VARCHAR(20),
  complemento VARCHAR(120),
  bairro VARCHAR(120),
  cidade VARCHAR(120),
  uf CHAR(2),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_alunos_cpf CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_alunos_uf CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alunos_cpf
  ON alunos(cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_nome
  ON alunos(LOWER(nome_completo));

CREATE TABLE IF NOT EXISTS responsaveis (
  id BIGSERIAL PRIMARY KEY,
  nome_completo VARCHAR(180) NOT NULL,
  cpf VARCHAR(11),
  rg VARCHAR(30),
  data_nascimento DATE,
  email VARCHAR(180),
  telefone_principal VARCHAR(30) NOT NULL,
  telefone_alternativo VARCHAR(30),
  profissao VARCHAR(120),
  cep VARCHAR(9),
  logradouro VARCHAR(180),
  numero_endereco VARCHAR(20),
  complemento VARCHAR(120),
  bairro VARCHAR(120),
  cidade VARCHAR(120),
  uf CHAR(2),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_responsaveis_cpf CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_responsaveis_uf CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_responsaveis_cpf
  ON responsaveis(cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_responsaveis_nome
  ON responsaveis(LOWER(nome_completo));

CREATE TABLE IF NOT EXISTS aluno_responsaveis (
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  responsavel_id BIGINT NOT NULL REFERENCES responsaveis(id) ON DELETE RESTRICT,
  parentesco VARCHAR(40) NOT NULL,
  responsavel_legal BOOLEAN NOT NULL DEFAULT TRUE,
  contato_principal BOOLEAN NOT NULL DEFAULT FALSE,
  autorizado_buscar BOOLEAN NOT NULL DEFAULT TRUE,
  reside_com_aluno BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aluno_id, responsavel_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aluno_contato_principal
  ON aluno_responsaveis(aluno_id)
  WHERE contato_principal = TRUE;

CREATE TABLE IF NOT EXISTS professores (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_completo VARCHAR(180) NOT NULL,
  cpf VARCHAR(11) NOT NULL,
  rg VARCHAR(30),
  data_nascimento DATE,
  email VARCHAR(180),
  telefone VARCHAR(30),
  matricula_funcional VARCHAR(40),
  formacao VARCHAR(180),
  especialidade VARCHAR(180),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_professores_cpf CHECK (cpf ~ '^[0-9]{11}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professores_cpf
  ON professores(cpf);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professores_matricula_funcional
  ON professores(matricula_funcional)
  WHERE matricula_funcional IS NOT NULL;

CREATE TABLE IF NOT EXISTS professor_escolas (
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  tipo_vinculo VARCHAR(40) NOT NULL DEFAULT 'Efetivo',
  carga_horaria_semanal NUMERIC(5,2),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (professor_id, escola_id),
  CONSTRAINT ck_professor_escola_carga
    CHECK (carga_horaria_semanal IS NULL OR carga_horaria_semanal > 0),
  CONSTRAINT ck_professor_escola_datas
    CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_professor_escolas_escola
  ON professor_escolas(escola_id, ativo);

CREATE TABLE IF NOT EXISTS funcionarios_educacao (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  nome_completo VARCHAR(180) NOT NULL,
  cpf VARCHAR(11) NOT NULL,
  rg VARCHAR(30),
  email VARCHAR(180),
  telefone VARCHAR(30),
  cargo VARCHAR(80) NOT NULL,
  matricula_funcional VARCHAR(40),
  tipo_vinculo VARCHAR(40) NOT NULL DEFAULT 'Efetivo',
  data_admissao DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_funcionarios_cpf CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_funcionarios_cargo CHECK (
    cargo IN (
      'Secretário Escolar',
      'Colaborador',
      'Acompanhante',
      'Motorista',
      'Merendeira',
      'Auxiliar de Limpeza',
      'Servente Escolar',
      'Outro'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_cpf_escola
  ON funcionarios_educacao(cpf, escola_id);

CREATE INDEX IF NOT EXISTS idx_funcionarios_escola
  ON funcionarios_educacao(escola_id, ativo);

CREATE TABLE IF NOT EXISTS turmas (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  ano_letivo INTEGER NOT NULL,
  nome VARCHAR(100) NOT NULL,
  etapa_ensino VARCHAR(100) NOT NULL,
  serie_ano VARCHAR(80) NOT NULL,
  turno VARCHAR(20) NOT NULL,
  capacidade INTEGER NOT NULL,
  sala VARCHAR(40),
  coordenador_usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativa',
  observacoes TEXT,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_turmas_ano CHECK (ano_letivo BETWEEN 2000 AND 2200),
  CONSTRAINT ck_turmas_turno CHECK (turno IN ('Matutino', 'Vespertino', 'Noturno', 'Integral')),
  CONSTRAINT ck_turmas_capacidade CHECK (capacidade > 0 AND capacidade <= 200),
  CONSTRAINT ck_turmas_status CHECK (status IN ('Planejada', 'Ativa', 'Encerrada', 'Cancelada')),
  UNIQUE (escola_id, ano_letivo, nome)
);

CREATE INDEX IF NOT EXISTS idx_turmas_escola_ano
  ON turmas(escola_id, ano_letivo, status);

CREATE TABLE IF NOT EXISTS turma_professores (
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  professor_id BIGINT NOT NULL REFERENCES professores(id) ON DELETE RESTRICT,
  componente_curricular VARCHAR(120) NOT NULL,
  carga_horaria_semanal NUMERIC(5,2),
  titular BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (turma_id, professor_id, componente_curricular),
  CONSTRAINT ck_turma_professor_carga
    CHECK (carga_horaria_semanal IS NULL OR carga_horaria_semanal > 0)
);

CREATE INDEX IF NOT EXISTS idx_turma_professores_professor
  ON turma_professores(professor_id);

CREATE TABLE IF NOT EXISTS sequencias_matricula (
  ano_letivo INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT ck_sequencia_matricula_ano CHECK (ano_letivo BETWEEN 2000 AND 2200),
  CONSTRAINT ck_sequencia_matricula_numero CHECK (ultimo_numero >= 0)
);

CREATE TABLE IF NOT EXISTS matriculas (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(30) NOT NULL UNIQUE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE RESTRICT,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  ano_letivo INTEGER NOT NULL,
  data_matricula DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativa',
  escola_origem VARCHAR(180),
  observacoes TEXT,
  criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_matriculas_ano CHECK (ano_letivo BETWEEN 2000 AND 2200),
  CONSTRAINT ck_matriculas_status CHECK (
    status IN ('Pendente', 'Ativa', 'Transferida', 'Cancelada', 'Concluída')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matricula_ativa_aluno_ano
  ON matriculas(aluno_id, ano_letivo)
  WHERE status IN ('Pendente', 'Ativa');

CREATE INDEX IF NOT EXISTS idx_matriculas_turma
  ON matriculas(turma_id, status);

CREATE INDEX IF NOT EXISTS idx_matriculas_escola_ano
  ON matriculas(escola_id, ano_letivo, status);

CREATE OR REPLACE FUNCTION gerar_numero_matricula(p_ano_letivo INTEGER)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequencia INTEGER;
  v_sufixo VARCHAR;
BEGIN
  IF p_ano_letivo < 2000 OR p_ano_letivo > 2200 THEN
    RAISE EXCEPTION 'Ano letivo inválido para geração da matrícula.';
  END IF;

  INSERT INTO sequencias_matricula (ano_letivo, ultimo_numero)
  VALUES (p_ano_letivo, 1)
  ON CONFLICT (ano_letivo)
  DO UPDATE SET ultimo_numero = sequencias_matricula.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_sequencia;

  v_sufixo := CASE
    WHEN v_sequencia < 1000 THEN LPAD(v_sequencia::TEXT, 3, '0')
    ELSE v_sequencia::TEXT
  END;

  RETURN p_ano_letivo::TEXT || v_sufixo;
END;
$$;

CREATE OR REPLACE FUNCTION preencher_numero_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero IS NULL OR BTRIM(NEW.numero) = '' THEN
    NEW.numero := gerar_numero_matricula(NEW.ano_letivo);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preencher_numero_matricula ON matriculas;
CREATE TRIGGER trg_preencher_numero_matricula
BEFORE INSERT ON matriculas
FOR EACH ROW
EXECUTE FUNCTION preencher_numero_matricula();

CREATE OR REPLACE FUNCTION atualizar_timestamp_academico()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alunos_atualizado_em ON alunos;
CREATE TRIGGER trg_alunos_atualizado_em
BEFORE UPDATE ON alunos
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

DROP TRIGGER IF EXISTS trg_responsaveis_atualizado_em ON responsaveis;
CREATE TRIGGER trg_responsaveis_atualizado_em
BEFORE UPDATE ON responsaveis
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

DROP TRIGGER IF EXISTS trg_professores_atualizado_em ON professores;
CREATE TRIGGER trg_professores_atualizado_em
BEFORE UPDATE ON professores
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

DROP TRIGGER IF EXISTS trg_funcionarios_atualizado_em ON funcionarios_educacao;
CREATE TRIGGER trg_funcionarios_atualizado_em
BEFORE UPDATE ON funcionarios_educacao
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

DROP TRIGGER IF EXISTS trg_turmas_atualizado_em ON turmas;
CREATE TRIGGER trg_turmas_atualizado_em
BEFORE UPDATE ON turmas
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

DROP TRIGGER IF EXISTS trg_matriculas_atualizado_em ON matriculas;
CREATE TRIGGER trg_matriculas_atualizado_em
BEFORE UPDATE ON matriculas
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_academico();

ALTER TABLE alunos_rotas_transporte
  ADD COLUMN IF NOT EXISTS aluno_id BIGINT REFERENCES alunos(id) ON DELETE SET NULL;

ALTER TABLE alunos_rotas_transporte
  ADD COLUMN IF NOT EXISTS matricula_id BIGINT REFERENCES matriculas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_rotas_aluno
  ON alunos_rotas_transporte(aluno_id)
  WHERE aluno_id IS NOT NULL;

CREATE OR REPLACE VIEW vw_turmas_resumo AS
SELECT
  t.id,
  t.escola_id,
  t.ano_letivo,
  t.nome,
  t.etapa_ensino,
  t.serie_ano,
  t.turno,
  t.capacidade,
  t.sala,
  t.coordenador_usuario_id,
  t.status,
  COUNT(m.id) FILTER (WHERE m.status = 'Ativa')::INTEGER AS alunos_matriculados,
  GREATEST(
    t.capacidade - COUNT(m.id) FILTER (WHERE m.status = 'Ativa')::INTEGER,
    0
  ) AS vagas_disponiveis
FROM turmas t
LEFT JOIN matriculas m ON m.turma_id = t.id
GROUP BY t.id;
