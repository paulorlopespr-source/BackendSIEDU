CREATE SEQUENCE IF NOT EXISTS solicitacoes_administrativas_seq START 1;
CREATE TABLE IF NOT EXISTS solicitacoes_administrativas (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(30) NOT NULL UNIQUE,
  categoria VARCHAR(30) NOT NULL CHECK (categoria IN ('Material','Documento','Transferência','Transporte','Equipamento','Serviço','Autorização')),
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  prioridade VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (prioridade IN ('Baixa','Normal','Alta','Urgente')),
  escola_id INTEGER REFERENCES escolas(id) ON DELETE RESTRICT,
  setor_solicitante VARCHAR(150),
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  prazo DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'Solicitação' CHECK (status IN ('Solicitação','Em análise','Aprovada','Reprovada','Em execução','Concluída')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), concluido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS solicitacoes_administrativas_status_idx ON solicitacoes_administrativas(status,criado_em DESC);
CREATE INDEX IF NOT EXISTS solicitacoes_administrativas_escola_idx ON solicitacoes_administrativas(escola_id,criado_em DESC);
CREATE TABLE IF NOT EXISTS historico_solicitacoes_administrativas (
  id BIGSERIAL PRIMARY KEY,
  solicitacao_id BIGINT NOT NULL REFERENCES solicitacoes_administrativas(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(50) NOT NULL, status_anterior VARCHAR(30), status_novo VARCHAR(30) NOT NULL,
  despacho TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS historico_solicitacoes_adm_idx ON historico_solicitacoes_administrativas(solicitacao_id,criado_em);
