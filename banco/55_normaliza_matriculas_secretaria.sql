-- Normaliza identificadores legados para o padrão institucional SEdu####.
DO $$
DECLARE item RECORD; registro TEXT;
BEGIN
  FOR item IN SELECT id FROM usuarios WHERE matricula_funcional IS NULL OR matricula_funcional = '' OR matricula_funcional !~ '^SEdu[0-9]{4}$' LOOP
    LOOP
      registro := 'SEdu' || (1000 + floor(random() * 9000))::int;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM usuarios WHERE matricula_funcional = registro);
    END LOOP;
    UPDATE usuarios SET matricula_funcional = registro WHERE id = item.id;
  END LOOP;
END $$;
