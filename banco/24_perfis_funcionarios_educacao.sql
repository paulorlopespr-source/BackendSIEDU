INSERT INTO tipos_usuarios (nome, nivel, descricao)
SELECT perfil.nome, perfil.nivel, perfil.descricao
FROM (VALUES
  ('Motorista', 5, 'Motorista da rede municipal de educação'),
  ('Auxiliar de Serviços Gerais', 5, 'Profissional de serviços gerais da unidade escolar'),
  ('Auxiliar de Vida Escolar (AVE)', 5, 'Profissional de apoio e acompanhamento da vida escolar'),
  ('Secretaria Administrativa', 5, 'Profissional da secretaria administrativa'),
  ('Secretaria Escolar', 5, 'Profissional da secretaria escolar'),
  ('Diretor', 3, 'Diretor da unidade escolar'),
  ('Coordenador', 4, 'Coordenador pedagógico'),
  ('Professor', 5, 'Professor da unidade escolar')
) AS perfil(nome, nivel, descricao)
WHERE NOT EXISTS (
  SELECT 1
  FROM tipos_usuarios existente
  WHERE LOWER(existente.nome) = LOWER(perfil.nome)
);

UPDATE tipos_usuarios AS existente
SET nivel = perfil.nivel,
    descricao = perfil.descricao
FROM (VALUES
  ('Motorista', 5, 'Motorista da rede municipal de educação'),
  ('Auxiliar de Serviços Gerais', 5, 'Profissional de serviços gerais da unidade escolar'),
  ('Auxiliar de Vida Escolar (AVE)', 5, 'Profissional de apoio e acompanhamento da vida escolar'),
  ('Secretaria Administrativa', 5, 'Profissional da secretaria administrativa'),
  ('Secretaria Escolar', 5, 'Profissional da secretaria escolar'),
  ('Diretor', 3, 'Diretor da unidade escolar'),
  ('Coordenador', 4, 'Coordenador pedagógico'),
  ('Professor', 5, 'Professor da unidade escolar')
) AS perfil(nome, nivel, descricao)
WHERE LOWER(existente.nome) = LOWER(perfil.nome);

UPDATE usuarios AS usuario
SET tipo_usuario_id = destino.id,
    atualizado_em = NOW()
FROM tipos_usuarios AS antigo
CROSS JOIN tipos_usuarios AS destino
WHERE usuario.tipo_usuario_id = antigo.id
  AND antigo.nome IN (
    'Funcionario da Educacao',
    'Colaborador',
    'Merendeira',
    'Auxiliar de Limpeza',
    'Servente Escolar'
  )
  AND destino.nome = 'Auxiliar de Serviços Gerais';

UPDATE usuarios AS usuario
SET tipo_usuario_id = destino.id,
    atualizado_em = NOW()
FROM tipos_usuarios AS antigo
CROSS JOIN tipos_usuarios AS destino
WHERE usuario.tipo_usuario_id = antigo.id
  AND antigo.nome = 'Acompanhante'
  AND destino.nome = 'Auxiliar de Vida Escolar (AVE)';

UPDATE usuarios AS usuario
SET tipo_usuario_id = destino.id,
    atualizado_em = NOW()
FROM tipos_usuarios AS antigo
CROSS JOIN tipos_usuarios AS destino
WHERE usuario.tipo_usuario_id = antigo.id
  AND antigo.nome IN ('Vice-diretor', 'Secretário Escolar')
  AND destino.nome = CASE
    WHEN antigo.nome = 'Vice-diretor' THEN 'Diretor'
    ELSE 'Secretaria Escolar'
  END;
