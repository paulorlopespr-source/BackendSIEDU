-- Bloqueia as contas temporárias após o teste, preservando demandas e auditoria.
UPDATE usuarios
SET ativo = FALSE,
    situacao_acesso = 'bloqueado',
    atualizado_em = NOW()
WHERE usuario IN (
  'teste.fluxo.diretor',
  'teste.fluxo.secretaria',
  'teste.fluxo.administracao'
);

INSERT INTO historico_permissoes
  (usuario_id, tipo_usuario_id, escolas_ids, situacao_acesso, acao, realizado_por)
SELECT u.id, u.tipo_usuario_id,
  CASE WHEN u.escola_id IS NULL THEN ARRAY[]::INTEGER[] ELSE ARRAY[u.escola_id]::INTEGER[] END,
  'bloqueado', 'bloqueio_pos_teste', NULL
FROM usuarios u
WHERE u.usuario IN (
  'teste.fluxo.diretor',
  'teste.fluxo.secretaria',
  'teste.fluxo.administracao'
)
AND NOT EXISTS (
  SELECT 1 FROM historico_permissoes h
  WHERE h.usuario_id = u.id AND h.acao = 'bloqueio_pos_teste'
);
