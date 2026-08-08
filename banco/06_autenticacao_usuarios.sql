-- Campos necessários para autenticação e primeiro acesso.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(80) UNIQUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deve_alterar_senha BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
