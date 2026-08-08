/*criação do ban cco de dados */

CREATE TABLE tipos_usuarios (
     id SERIAL PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    nivel INT NOT NULL,
    descricao TEXT
);


CREATE TABLE secretarias (
     id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL
);

CREATE TABLE escolas (
      id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    inep VARCHAR(20),
    telefone VARCHAR(20),
    endereco TEXT,
    secretaria_id INT
);

CREATE TABLE usuarios ( 
    
     id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    tipo_usuario_id INT NOT NULL,
    escola_id INT,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );