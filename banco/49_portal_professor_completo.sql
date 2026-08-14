-- Conclusão do Portal do Professor: aprovação pedagógica, integrações,
-- anexos protegidos, comunicação, histórico e perfil autogerenciável.

ALTER TABLE planejamentos_aula
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avaliado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avaliado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parecer_coordenacao TEXT;

CREATE TABLE IF NOT EXISTS historico_planejamentos_aula (
  id BIGSERIAL PRIMARY KEY,
  planejamento_id BIGINT NOT NULL REFERENCES planejamentos_aula(id) ON DELETE CASCADE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(40) NOT NULL,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30) NOT NULL,
  parecer TEXT,
  versao INTEGER NOT NULL,
  dados JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historico_planejamento
  ON historico_planejamentos_aula(planejamento_id, criado_em DESC);

ALTER TABLE atividades_programadas
  ADD COLUMN IF NOT EXISTS avaliacao_id BIGINT REFERENCES avaliacoes_professor(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

ALTER TABLE diarios_classe
  ADD COLUMN IF NOT EXISTS atividade_id BIGINT REFERENCES atividades_programadas(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS historico_atividades_programadas (
  id BIGSERIAL PRIMARY KEY,
  atividade_id BIGINT NOT NULL REFERENCES atividades_programadas(id) ON DELETE CASCADE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(30) NOT NULL,
  dados JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historico_atividade
  ON historico_atividades_programadas(atividade_id, criado_em DESC);

ALTER TABLE materiais_aula
  ADD COLUMN IF NOT EXISTS arquivo_bytes BYTEA,
  ADD COLUMN IF NOT EXISTS arquivo_tamanho INTEGER,
  ADD COLUMN IF NOT EXISTS arquivo_hash VARCHAR(64);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS biografia_profissional TEXT,
  ADD COLUMN IF NOT EXISTS tema_interface VARCHAR(20) NOT NULL DEFAULT 'claro',
  ADD COLUMN IF NOT EXISTS cor_destaque VARCHAR(20) NOT NULL DEFAULT '#176fe3',
  ADD COLUMN IF NOT EXISTS notificacoes_email BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notificacoes_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mensagens_escolares (
  id BIGSERIAL PRIMARY KEY,
  remetente_usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  destinatario_usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE,
  turma_id BIGINT REFERENCES turmas(id) ON DELETE CASCADE,
  assunto VARCHAR(180) NOT NULL,
  corpo TEXT NOT NULL,
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (destinatario_usuario_id IS NOT NULL OR turma_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_mensagens_destinatario
  ON mensagens_escolares(destinatario_usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_remetente
  ON mensagens_escolares(remetente_usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_turma
  ON mensagens_escolares(turma_id, criado_em DESC);
