INSERT INTO tipos_usuarios (nome, nivel, descricao)
SELECT perfil.nome, perfil.nivel, perfil.descricao
FROM (VALUES
  ('Secretário Municipal de Educação', 1, 'Gestão integral da rede municipal de ensino'),
  ('Superintendente / Diretor de Ensino', 2, 'Supervisão pedagógica e administrativa municipal'),
  ('Coordenador Pedagógico Municipal', 3, 'Coordenação pedagógica da rede municipal'),
  ('Técnico da Secretaria de Educação', 3, 'Operação técnica da Secretaria Municipal de Educação'),
  ('Diretor', 4, 'Gestão de unidade escolar'),
  ('Vice-Diretor', 4, 'Gestão de unidade escolar'),
  ('Coordenador Pedagógico', 4, 'Coordenação pedagógica da unidade escolar'),
  ('Secretário Escolar', 4, 'Secretaria e registros escolares'),
  ('Auxiliar/Assistente Administrativo', 5, 'Apoio administrativo'),
  ('Professor', 5, 'Docência'),
  ('Auxiliar de Vida Escolar / Cuidador', 5, 'Apoio à inclusão e cuidados'),
  ('Auxiliar de Serviços Gerais', 5, 'Serviços gerais escolares'),
  ('Motorista', 5, 'Transporte escolar'),
  ('Monitor de Transporte Escolar', 5, 'Acompanhamento no transporte escolar'),
  ('Merendeira/Cozinheira', 5, 'Alimentação escolar'),
  ('Porteiro/Vigia', 5, 'Portaria e vigilância'),
  ('Psicólogo', 4, 'Apoio psicossocial'),
  ('Assistente Social', 4, 'Apoio socioassist
