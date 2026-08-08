INSERT INTO tipos_usuarios (nome, nivel, descricao)
SELECT 'Vice-diretor', 3, 'Vice-diretor Escolar'
WHERE NOT EXISTS (
  SELECT 1
  FROM tipos_usuarios
  WHERE LOWER(nome) = 'vice-diretor'
);
