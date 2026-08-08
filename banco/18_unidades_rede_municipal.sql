-- Relação oficial das unidades escolares da Rede Municipal de Pindobaçu.
-- Fonte: documento institucional da SMEP, consolidado em 05/08/2026.
-- Migração idempotente: preserva dados complementares já cadastrados.

BEGIN;

ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS codigo_rede VARCHAR(10),
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(80),
  ADD COLUMN IF NOT EXISTS localidade VARCHAR(120),
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO secretarias (nome)
SELECT 'Secretaria Municipal de Educação de Pindobaçu'
WHERE NOT EXISTS (
  SELECT 1
  FROM secretarias
  WHERE LOWER(TRIM(nome)) = LOWER('Secretaria Municipal de Educação de Pindobaçu')
);

CREATE TEMP TABLE unidades_rede_oficial (
  codigo_rede VARCHAR(10) PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  categoria VARCHAR(80) NOT NULL,
  localidade VARCHAR(120)
) ON COMMIT DROP;

INSERT INTO unidades_rede_oficial (codigo_rede, nome, categoria, localidade)
VALUES
  ('01', 'Creche Carinho Vó Neném', 'Creche', NULL),
  ('02', 'Creche Casulo Tia Mira - Carnaíba', 'Creche', 'Carnaíba'),
  ('03', 'Creche Carinho da Serra de Carnaíba', 'Creche', 'Serra de Carnaíba'),
  ('04', 'Creche Carinho de Várzea Grande', 'Creche', 'Várzea Grande'),
  ('05', 'Creche Carinho Beth-Shalom - Bananeiras', 'Creche', 'Bananeiras'),
  ('06', 'Creche Carinho de Laginha', 'Creche', 'Laginha'),
  ('07', 'Creche Carinho de Fumaça', 'Creche', 'Fumaça'),
  ('08', 'Creche Carinho de Lutanda', 'Creche', 'Lutanda'),
  ('09', 'Creche Benigna Rosa Lima de Jesus - Jatobá', 'Creche', 'Jatobá'),
  ('10', 'Centro de Educação Infantil de Pindobaçu - CEIP', 'Centro de Educação Infantil', 'Pindobaçu'),
  ('11', 'Centro de Educação Infantil Serra da Carnaíba - CEISC', 'Centro de Educação Infantil', 'Serra da Carnaíba'),
  ('12', 'Centro de Educação Infantil de Carnaíba - CEIC', 'Centro de Educação Infantil', 'Carnaíba'),
  ('13', 'Centro de Educação Infantil de Bananeiras - CEIB', 'Centro de Educação Infantil', 'Bananeiras'),
  ('14', 'Escola Municipal de Laginha 1', 'Escola Municipal', 'Laginha'),
  ('15', 'Escola Municipal José Gomes de Souza - Lutanda', 'Escola Municipal', 'Lutanda'),
  ('16', 'Escola Municipal João Vieira - Fumaça', 'Escola Municipal', 'Fumaça'),
  ('17', 'Escola Municipal Castro Alves - Jatobá', 'Escola Municipal', 'Jatobá'),
  ('18', 'Escola Municipal Ruy Barbosa - Cágados', 'Escola Municipal', 'Cágados'),
  ('19', 'Escola Municipal do PA Nova Canaã', 'Escola Municipal', 'PA Nova Canaã'),
  ('20', 'Escola Municipal Guilhermino José dos Santos - Marota', 'Escola Municipal', 'Marota'),
  ('21', 'Escola Municipal de Itapicuru', 'Escola Municipal', 'Itapicuru'),
  ('22', 'Escola Municipal Aurélio Braz da Silva - Olhos D''Água', 'Escola Municipal', 'Olhos D''Água'),
  ('23', 'Escola Municipal de Ouricuri - Cajueiro', 'Escola Municipal', 'Cajueiro'),
  ('24', 'Colégio Municipal Serra da Carnaíba', 'Colégio Municipal', 'Serra da Carnaíba'),
  ('25', 'Colégio Municipal Faustino Dias Lima - Carnaíba', 'Colégio Municipal', 'Carnaíba'),
  ('26', 'Colégio Municipal Doutor Anísio Teixeira - Sede', 'Colégio Municipal', 'Sede'),
  ('27', 'Colégio Municipal Antônio Joaquim de Miranda - Várzea Grande', 'Colégio Municipal', 'Várzea Grande'),
  ('28', 'Colégio Municipal Rômulo Galvão - Sede', 'Colégio Municipal', 'Sede'),
  ('29', 'Colégio Municipal Telésforo Silveira de Menezes - Bananeiras', 'Colégio Municipal', 'Bananeiras'),
  ('30', 'Colégio Municipal Professor Luiz Navarro de Brito - Sede', 'Colégio Municipal', 'Sede'),
  ('31', 'Colégio Municipal Eraldo Tinoco - Sede', 'Colégio Municipal', 'Sede'),
  ('32', 'Colégio Municipal Álvaro Palmeira de Carvalho - Sede', 'Colégio Municipal', 'Sede'),
  ('33', 'Centro de Atividades Educacionais de Carnaíba', 'Centro de Atividades Educacionais', 'Carnaíba'),
  ('34', 'Centro de Atividades Educacionais de Serra da Carnaíba', 'Centro de Atividades Educacionais', 'Serra da Carnaíba'),
  ('35', 'Centro de Atividades Educacionais de Pindobaçu', 'Centro de Atividades Educacionais', 'Pindobaçu'),
  ('36', 'Escola de Ingá', 'Escola Municipal', 'Ingá');

-- Corrige cadastros preexistentes sem perder INEP, telefone, endereço ou vínculos.
UPDATE escolas
SET nome = 'Colégio Municipal Rômulo Galvão - Sede'
WHERE LOWER(TRIM(nome)) = LOWER('Colegio Municipal Rômulo Galvão');

UPDATE escolas
SET nome = 'Colégio Municipal Professor Luiz Navarro de Brito - Sede'
WHERE LOWER(TRIM(nome)) IN (
  LOWER('Escola Muhnicipal Navarro de Brito'),
  LOWER('Escola Municipal Navarro de Brito'),
  LOWER('Colégio Municipal Luiz Navarro de Brito')
);

UPDATE escolas AS escola
SET
  codigo_rede = unidade.codigo_rede,
  categoria = unidade.categoria,
  localidade = unidade.localidade,
  secretaria_id = COALESCE(
    escola.secretaria_id,
    (SELECT id FROM secretarias ORDER BY id LIMIT 1)
  ),
  ativo = TRUE
FROM unidades_rede_oficial AS unidade
WHERE LOWER(TRIM(escola.nome)) = LOWER(TRIM(unidade.nome));

INSERT INTO escolas (
  nome,
  codigo_rede,
  categoria,
  localidade,
  secretaria_id,
  ativo
)
SELECT
  unidade.nome,
  unidade.codigo_rede,
  unidade.categoria,
  unidade.localidade,
  (SELECT id FROM secretarias ORDER BY id LIMIT 1),
  TRUE
FROM unidades_rede_oficial AS unidade
WHERE NOT EXISTS (
  SELECT 1
  FROM escolas AS escola
  WHERE escola.codigo_rede = unidade.codigo_rede
     OR LOWER(TRIM(escola.nome)) = LOWER(TRIM(unidade.nome))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_escolas_codigo_rede
  ON escolas(codigo_rede)
  WHERE codigo_rede IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_escolas_nome_normalizado
  ON escolas(LOWER(TRIM(nome)));

CREATE INDEX IF NOT EXISTS idx_escolas_categoria_localidade
  ON escolas(categoria, localidade)
  WHERE ativo = TRUE;

COMMIT;
