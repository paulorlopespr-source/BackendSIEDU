CREATE TABLE IF NOT EXISTS atividades_complementares (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  ano_letivo INTEGER NOT NULL,
  unidade_letiva INTEGER NOT NULL CHECK (unidade_letiva BETWEEN 1 AND 4),
  semana_inicio DATE NOT NULL,
  area_conhecimento VARCHAR(80) NOT NULL,
  pauta TEXT NOT NULL,
  encaminhamentos TEXT NOT NULL,
  participantes TEXT,
  responsavel_id BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planos_intervencao_unidade (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  turma_id BIGINT REFERENCES turmas(id) ON DELETE SET NULL,
  ano_letivo INTEGER NOT NULL,
  unidade_letiva INTEGER NOT NULL CHECK (unidade_letiva BETWEEN 1 AND 4),
  diagnostico TEXT NOT NULL,
  objetivos TEXT NOT NULL,
  acoes TEXT NOT NULL,
  responsaveis TEXT NOT NULL,
  prazo DATE,
  indicadores TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração','Em execução','Concluído','Revisão necessária')),
  responsavel_id BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conselhos_classe (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  turma_id BIGINT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  ano_letivo INTEGER NOT NULL,
  unidade_letiva INTEGER NOT NULL CHECK (unidade_letiva BETWEEN 1 AND 4),
  etapa VARCHAR(15) NOT NULL CHECK (etapa IN ('Parcial','Final')),
  data_reuniao DATE NOT NULL,
  diagnostico_turma TEXT NOT NULL,
  estudantes_destaque TEXT,
  estudantes_atencao TEXT,
  decisoes TEXT NOT NULL,
  participantes TEXT,
  responsavel_id BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turma_id, ano_letivo, unidade_letiva, etapa)
);

CREATE TABLE IF NOT EXISTS planos_educacionais_individualizados (
  id BIGSERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  aluno_id BIGINT NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  ano_letivo INTEGER NOT NULL,
  necessidades_educacionais TEXT NOT NULL,
  potencialidades TEXT NOT NULL,
  barreiras TEXT NOT NULL,
  objetivos TEXT NOT NULL,
  estrategias_adaptacoes TEXT NOT NULL,
  recursos_acessibilidade TEXT,
  avaliacao_acompanhamento TEXT NOT NULL,
  profissionais_envolvidos TEXT,
  responsavel_id BIGINT NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aluno_id, ano_letivo)
);

CREATE INDEX IF NOT EXISTS idx_ac_escola_periodo ON atividades_complementares(escola_id, ano_letivo, unidade_letiva);
CREATE INDEX IF NOT EXISTS idx_intervencao_escola_periodo ON planos_intervencao_unidade(escola_id, ano_letivo, unidade_letiva);
CREATE INDEX IF NOT EXISTS idx_conselho_escola_periodo ON conselhos_classe(escola_id, ano_letivo, unidade_letiva);
CREATE INDEX IF NOT EXISTS idx_pei_escola_ano ON planos_educacionais_individualizados(escola_id, ano_letivo);
