ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS versao_sessao INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN usuarios.versao_sessao IS
  'Incrementada após troca, recuperação ou redefinição administrativa de senha para invalidar tokens anteriores.';

