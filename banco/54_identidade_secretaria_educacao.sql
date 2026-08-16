-- Atualiza o nome institucional do perfil administrativo sem alterar seus níveis/permissões.
UPDATE tipos_usuarios
SET nome = 'Secretaria Administrativa da Educação',
    descricao = 'Área administrativa da Secretaria Municipal de Educação'
WHERE nome = 'Técnico da Secretaria de Educação';

UPDATE usuarios
SET secretaria_setor = COALESCE(NULLIF(secretaria_setor, ''), 'Secretaria Administrativa da Educação')
WHERE tipo_usuario_id IN (SELECT id FROM tipos_usuarios WHERE nome = 'Secretaria Administrativa da Educação');

-- Preenche cadastros antigos que ainda não possuem matrícula da Secretaria.
DO $$
DECLARE item RECORD; registro TEXT;
BEGIN
  FOR item IN SELECT id FROM usuarios WHERE matricula_funcional IS NULL OR matricula_funcional = '' LOOP
    LOOP
      registro := 'SEdu' || (1000 + floor(random() * 9000))::int;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM usuarios WHERE matricula_funcional = registro);
    END LOOP;
    UPDATE usuarios SET matricula_funcional = registro WHERE id = item.id;
  END LOOP;
END $$;
