INSERT INTO tipos_usuarios (nome, nivel, descricao)
SELECT 'Funcionario da Educacao', 5, 'Colaborador da limpeza e demais equipes escolares'
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_usuarios WHERE nome = 'Funcionario da Educacao'
);