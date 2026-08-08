CREATE TABLE IF NOT EXISTS alocacoes_recursos_escolares (
  id SERIAL PRIMARY KEY,
  escola_id INTEGER NOT NULL REFERENCES escolas(id),
  categoria VARCHAR(30) NOT NULL CHECK (categoria IN ('Financeiro', 'Merenda Escolar')),
  descricao TEXT NOT NULL,
  valor_alocado NUMERIC(12,2) NOT NULL CHECK (valor_alocado >= 0),
  valor_utilizado NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_utilizado >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'Em acompanhamento' CHECK (status IN ('Em acompanhamento', 'Aprovado', 'Com pendencia', 'Reuniao solicitada')),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comprovacoes_recursos_escolares (
  id SERIAL PRIMARY KEY,
  alocacao_id INTEGER NOT NULL REFERENCES alocacoes_recursos_escolares(id) ON DELETE CASCADE,
  numero_nota_fiscal VARCHAR(80) NOT NULL,
  arquivo_url TEXT,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  enviado_por INTEGER NOT NULL REFERENCES usuarios(id),
  enviado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditorias_recursos_escolares (
  id SERIAL PRIMARY KEY,
  alocacao_id INTEGER NOT NULL REFERENCES alocacoes_recursos_escolares(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL CHECK (status IN ('Aprovado', 'Com pendencia', 'Reuniao solicitada')),
  justificativa TEXT NOT NULL,
  data_reuniao TIMESTAMP,
  avaliado_por INTEGER NOT NULL REFERENCES usuarios(id),
  avaliado_em TIMESTAMP NOT NULL DEFAULT NOW()
);