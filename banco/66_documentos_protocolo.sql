CREATE SEQUENCE IF NOT EXISTS protocolo_documentos_seq;

CREATE TABLE IF NOT EXISTS documentos_protocolo (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(40) NOT NULL UNIQUE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Ofício','Memorando','Circular','Requerimento','Processo','Comunicação interna','Outros')),
  assunto VARCHAR(255) NOT NULL,
  descricao TEXT NOT NULL,
  classificacao VARCHAR(100),
  origem VARCHAR(180) NOT NULL,
  destinatario VARCHAR(180),
  setor_atual VARCHAR(120),
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Recebido' CHECK (status IN ('Recebido','Encaminhado','Em setor','Respondido','Finalizado','Arquivado')),
  prazo DATE,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  arquivado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tramitacoes_protocolo (
  id BIGSERIAL PRIMARY KEY,
  documento_id BIGINT NOT NULL REFERENCES documentos_protocolo(id) ON DELETE RESTRICT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  evento VARCHAR(50) NOT NULL,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30) NOT NULL,
  setor_origem VARCHAR(120),
  setor_destino VARCHAR(120),
  destinatario VARCHAR(180),
  despacho TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documentos_protocolo_status_idx ON documentos_protocolo(status, prazo, criado_em DESC);
CREATE INDEX IF NOT EXISTS documentos_protocolo_numero_idx ON documentos_protocolo(numero);
CREATE INDEX IF NOT EXISTS tramitacoes_protocolo_documento_idx ON tramitacoes_protocolo(documento_id, criado_em);
