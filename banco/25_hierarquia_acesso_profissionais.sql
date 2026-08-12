ALTER TABLE tipos_usuarios
  ADD COLUMN IF NOT EXISTS grupo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS escopo_acesso VARCHAR(80) NOT NULL DEFAULT 'legado',
  ADD COLUMN IF NOT EXISTS requer_escola BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS acesso_sistema BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO tipos_usuarios (
  nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema, descricao
)
SELECT *
FROM (VALUES
  ('Secretário Municipal de Educação', 2, 'Gestão municipal', 'municipal_total', FALSE, TRUE, 'Gestão total da Secretaria Municipal de Educação'),
  ('Superintendente / Diretor de Ensino', 2, 'Gestão municipal', 'municipal_total', FALSE, TRUE, 'Gestão estratégica da rede municipal de ensino'),
  ('Coordenador Pedagógico Municipal', 3, 'Gestão municipal', 'municipal_pedagogico', FALSE, TRUE, 'Coordenação pedagógica em âmbito municipal'),
  ('Técnico da Secretaria de Educação', 3, 'Gestão municipal', 'municipal_tecnico', FALSE, TRUE, 'Acesso técnico definido conforme atribuições'),
  ('Diretor', 4, 'Gestão escolar', 'escola_gestao', TRUE, TRUE, 'Gestão da unidade escolar vinculada'),
  ('Vice-Diretor', 4, 'Gestão escolar', 'escola_gestao', TRUE, TRUE, 'Gestão da unidade escolar vinculada'),
  ('Coordenador Pedagógico', 4, 'Gestão escolar', 'escola_pedagogico', TRUE, TRUE, 'Coordenação pedagógica da unidade escolar'),
  ('Secretário Escolar', 5, 'Administrativo', 'escola_administrativo', TRUE, TRUE, 'Operação da secretaria escolar'),
  ('Auxiliar/Assistente Administrativo', 5, 'Administrativo', 'escola_administrativo_limitado', TRUE, TRUE, 'Acesso administrativo conforme atribuições'),
  ('Professor', 5, 'Pedagógico', 'pedagogico_professor', TRUE, TRUE, 'Acesso pedagógico às turmas vinculadas'),
  ('Auxiliar de Vida Escolar / Cuidador', 6, 'Apoio ao aluno', 'aluno_limitado', TRUE, TRUE, 'Acesso limitado aos alunos sob acompanhamento'),
  ('Auxiliar de Serviços Gerais', 7, 'Apoio', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Motorista', 6, 'Transporte', 'transporte_limitado', FALSE, TRUE, 'Acesso limitado ao módulo de transporte'),
  ('Monitor de Transporte Escolar', 6, 'Transporte', 'transporte_limitado', FALSE, TRUE, 'Acesso limitado ao módulo de transporte'),
  ('Merendeira/Cozinheira', 7, 'Alimentação', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Porteiro/Vigia', 7, 'Apoio', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Psicólogo', 6, 'Multidisciplinar', 'modulo_psicologia', FALSE, TRUE, 'Acesso restrito ao módulo de Psicologia'),
  ('Assistente Social', 6, 'Multidisciplinar', 'modulo_servico_social', FALSE, TRUE, 'Acesso restrito ao módulo de Serviço Social'),
  ('Nutricionista', 6, 'Multidisciplinar', 'modulo_nutricao', FALSE, TRUE, 'Acesso restrito ao módulo de Nutrição')
) AS perfil(nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema, descricao)
WHERE NOT EXISTS (
  SELECT 1 FROM tipos_usuarios existente
  WHERE LOWER(existente.nome) = LOWER(perfil.nome)
);

UPDATE tipos_usuarios AS existente
SET nivel = perfil.nivel,
    grupo = perfil.grupo,
    escopo_acesso = perfil.escopo_acesso,
    requer_escola = perfil.requer_escola,
    acesso_sistema = perfil.acesso_sistema,
    descricao = perfil.descricao
FROM (VALUES
  ('Secretário Municipal de Educação', 2, 'Gestão municipal', 'municipal_total', FALSE, TRUE, 'Gestão total da Secretaria Municipal de Educação'),
  ('Superintendente / Diretor de Ensino', 2, 'Gestão municipal', 'municipal_total', FALSE, TRUE, 'Gestão estratégica da rede municipal de ensino'),
  ('Coordenador Pedagógico Municipal', 3, 'Gestão municipal', 'municipal_pedagogico', FALSE, TRUE, 'Coordenação pedagógica em âmbito municipal'),
  ('Técnico da Secretaria de Educação', 3, 'Gestão municipal', 'municipal_tecnico', FALSE, TRUE, 'Acesso técnico definido conforme atribuições'),
  ('Diretor', 4, 'Gestão escolar', 'escola_gestao', TRUE, TRUE, 'Gestão da unidade escolar vinculada'),
  ('Vice-Diretor', 4, 'Gestão escolar', 'escola_gestao', TRUE, TRUE, 'Gestão da unidade escolar vinculada'),
  ('Coordenador Pedagógico', 4, 'Gestão escolar', 'escola_pedagogico', TRUE, TRUE, 'Coordenação pedagógica da unidade escolar'),
  ('Secretário Escolar', 5, 'Administrativo', 'escola_administrativo', TRUE, TRUE, 'Operação da secretaria escolar'),
  ('Auxiliar/Assistente Administrativo', 5, 'Administrativo', 'escola_administrativo_limitado', TRUE, TRUE, 'Acesso administrativo conforme atribuições'),
  ('Professor', 5, 'Pedagógico', 'pedagogico_professor', TRUE, TRUE, 'Acesso pedagógico às turmas vinculadas'),
  ('Auxiliar de Vida Escolar / Cuidador', 6, 'Apoio ao aluno', 'aluno_limitado', TRUE, TRUE, 'Acesso limitado aos alunos sob acompanhamento'),
  ('Auxiliar de Serviços Gerais', 7, 'Apoio', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Motorista', 6, 'Transporte', 'transporte_limitado', FALSE, TRUE, 'Acesso limitado ao módulo de transporte'),
  ('Monitor de Transporte Escolar', 6, 'Transporte', 'transporte_limitado', FALSE, TRUE, 'Acesso limitado ao módulo de transporte'),
  ('Merendeira/Cozinheira', 7, 'Alimentação', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Porteiro/Vigia', 7, 'Apoio', 'sem_acesso', TRUE, FALSE, 'Perfil cadastral sem acesso operacional ao portal'),
  ('Psicólogo', 6, 'Multidisciplinar', 'modulo_psicologia', FALSE, TRUE, 'Acesso restrito ao módulo de Psicologia'),
  ('Assistente Social', 6, 'Multidisciplinar', 'modulo_servico_social', FALSE, TRUE, 'Acesso restrito ao módulo de Serviço Social'),
  ('Nutricionista', 6, 'Multidisciplinar', 'modulo_nutricao', FALSE, TRUE, 'Acesso restrito ao módulo de Nutrição')
) AS perfil(nome, nivel, grupo, escopo_acesso, requer_escola, acesso_sistema, descricao)
WHERE LOWER(existente.nome) = LOWER(perfil.nome);

UPDATE tipos_usuarios
SET grupo = 'Administração técnica',
    escopo_acesso = 'superadministrador',
    requer_escola = FALSE,
    acesso_sistema = TRUE
WHERE nome = 'Super Administrador';

UPDATE usuarios AS usuario
SET tipo_usuario_id = destino.id,
    atualizado_em = NOW()
FROM tipos_usuarios AS antigo
CROSS JOIN tipos_usuarios AS destino
WHERE usuario.tipo_usuario_id = antigo.id
  AND destino.nome = CASE antigo.nome
    WHEN 'Administrador Municipal' THEN 'Secretário Municipal de Educação'
    WHEN 'Coordenador' THEN 'Coordenador Pedagógico'
    WHEN 'Secretaria Administrativa' THEN 'Técnico da Secretaria de Educação'
    WHEN 'Secretaria Escolar' THEN 'Secretário Escolar'
    WHEN 'Professor(a)' THEN 'Professor'
    WHEN 'Auxiliar de Vida Escolar (AVE)' THEN 'Auxiliar de Vida Escolar / Cuidador'
    ELSE antigo.nome
  END
  AND antigo.nome IN (
    'Administrador Municipal',
    'Coordenador',
    'Secretaria Administrativa',
    'Secretaria Escolar',
    'Professor(a)',
    'Auxiliar de Vida Escolar (AVE)'
  );
