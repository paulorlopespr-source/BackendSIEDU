CREATE TABLE IF NOT EXISTS motoristas_transporte (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  cnh VARCHAR(30) NOT NULL,
  telefone VARCHAR(25),
  validade_cnh DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acompanhantes_transporte (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  telefone VARCHAR(25),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS veiculos_transporte (
  id SERIAL PRIMARY KEY,
  prefixo VARCHAR(30) NOT NULL UNIQUE,
  placa VARCHAR(10) UNIQUE,
  tipo VARCHAR(60) NOT NULL,
  marca_modelo VARCHAR(120),
  ano_fabricacao INTEGER,
  capacidade INTEGER,
  estado VARCHAR(50) NOT NULL DEFAULT 'Em operacao',
  foto_url TEXT,
  ultima_manutencao DATE,
  itens_manutencao TEXT,
  secretaria_id INTEGER REFERENCES secretarias(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotas_transporte (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  turno VARCHAR(30) NOT NULL,
  distancia_km NUMERIC(8,2),
  veiculo_id INTEGER NOT NULL REFERENCES veiculos_transporte(id),
  motorista_id INTEGER NOT NULL REFERENCES motoristas_transporte(id),
  acompanhante_id INTEGER REFERENCES acompanhantes_transporte(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotas_transporte_veiculo ON rotas_transporte(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_rotas_transporte_motorista ON rotas_transporte(motorista_id);