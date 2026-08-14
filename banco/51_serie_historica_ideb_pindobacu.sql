-- Série municipal oficial do IDEB de Pindobaçu/BA (código IBGE 2924603).
-- O IDEB é bienal. A janela 2015-2025 contém seis ciclos oficiais.
-- Em 2021 não houve resultado municipal disponível para os anos finais.
WITH serie(ano, etapa, valor, fonte, fonte_url) AS (
  VALUES
    (2015, 'Anos iniciais', 4.5::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2017, 'Anos iniciais', 4.5::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2019, 'Anos iniciais', 5.0::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2021, 'Anos iniciais', 4.9::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2023, 'Anos iniciais', 6.1::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2025, 'Anos iniciais', 6.0::numeric, 'INEP/MEC', 'https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025'),
    (2015, 'Anos finais', 3.7::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2017, 'Anos finais', 3.6::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2019, 'Anos finais', 3.3::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2023, 'Anos finais', 3.8::numeric, 'IBGE/INEP', 'https://cidades.ibge.gov.br/brasil/ba/pindobacu/pesquisa/40/30277'),
    (2025, 'Anos finais', 5.0::numeric, 'INEP/MEC', 'https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025')
)
INSERT INTO resultados_ideb
  (escola_id, codigo_inep, ano, etapa, valor, meta, fonte, fonte_url)
SELECT NULL, '2924603', ano, etapa, valor, NULL, fonte, fonte_url
FROM serie
ON CONFLICT ((COALESCE(escola_id, 0)), ano, etapa) DO UPDATE SET
  codigo_inep = EXCLUDED.codigo_inep,
  valor = EXCLUDED.valor,
  fonte = EXCLUDED.fonte,
  fonte_url = EXCLUDED.fonte_url,
  importado_em = NOW();
