export const saebEditorProfiles = new Set([
  'Super Administrador',
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
]);

export const isLearningProfessor = (access) => access?.perfil === 'Professor';
export const isLearningCoordinator = (access) => /coordenador.*pedagógico/i.test(access?.perfil || '');
export const hasMunicipalLearningScope = (access) => Boolean(
  access?.municipal || access?.perfil === 'Coordenador Pedagógico Municipal',
);
export const canEditRevisionTrails = (access) => isLearningProfessor(access) || isLearningCoordinator(access);
export const canDefineSaeb = (access) => saebEditorProfiles.has(access?.perfil);

export function schoolGradeNumber(label) {
  const match = String(label || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}
