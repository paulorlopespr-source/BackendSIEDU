ALTER TABLE atividades_programadas ADD COLUMN IF NOT EXISTS competencias TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE avaliacoes_professor ADD COLUMN IF NOT EXISTS competencias TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS idx_atividades_competencias ON atividades_programadas USING GIN(competencias);
UPDATE atividades_programadas
SET competencias = ARRAY['Resolver problemas','Raciocínio lógico','Comunicação matemática']
WHERE componente_curricular ILIKE '%Matemática%' AND cardinality(competencias)=0;
