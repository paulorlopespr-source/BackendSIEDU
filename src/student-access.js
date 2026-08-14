export const STUDENT_PROFILE = 'Aluno';

export function isStudentProfile(access) {
  return access?.perfil === STUDENT_PROFILE;
}

export const studentContextSql = `
  SELECT
    a.id AS "alunoId",
    a.nome_completo AS nome,
    a.nome_social AS "nomeSocial",
    a.data_nascimento AS "dataNascimento",
    a.email,
    m.id AS "matriculaId",
    m.numero AS matricula,
    m.ano_letivo AS "anoLetivo",
    m.status AS "statusMatricula",
    t.id AS "turmaId",
    t.nome AS turma,
    t.serie_ano AS "serieAno",
    t.etapa_ensino AS "etapaEnsino",
    t.turno,
    t.sala,
    e.id AS "escolaId",
    e.nome AS escola
  FROM alunos a
  JOIN matriculas m
    ON m.aluno_id = a.id
   AND m.status = 'Ativa'
  JOIN turmas t
    ON t.id = m.turma_id
   AND t.status = 'Ativa'
  JOIN escolas e ON e.id = m.escola_id
  WHERE a.usuario_id = $1
    AND a.ativo = TRUE
  ORDER BY m.ano_letivo DESC, m.id DESC
  LIMIT 1
`;
