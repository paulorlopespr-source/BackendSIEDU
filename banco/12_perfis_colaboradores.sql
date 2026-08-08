INSERT INTO tipos_usuarios (nome, nivel, descricao)
SELECT perfil.nome, 5, perfil.descricao
FROM (VALUES
  ('Professor', 'Professor da unidade escolar'),
  ('Colaborador', 'Colaborador da Educacao'),
  ('Acompanhante', 'Acompanhante do transporte escolar'),
  ('Motorista', 'Motorista do transporte escolar'),
  ('Merendeira', 'Profissional da merenda escolar'),
  ('Auxiliar de Limpeza', 'Auxiliar de limpeza escolar'),
  ('Servente Escolar', 'Limpeza, capinacao e manutencao escolar')
) AS perfil(nome, descricao)
WHERE NOT EXISTS (SELECT 1 FROM tipos_usuarios t WHERE t.nome = perfil.nome);

CREATE TABLE IF NOT EXISTS usuario_escolas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  escola_id INTEGER NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, escola_id)
);