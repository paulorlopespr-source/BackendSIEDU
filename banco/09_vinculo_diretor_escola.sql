ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS diretor_usuario_id INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_escolas_diretor_usuario
  ON escolas(diretor_usuario_id);