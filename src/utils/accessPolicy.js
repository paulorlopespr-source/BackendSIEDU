const ACADEMIC_MANAGEMENT_PROFILES = new Set([
  'Super Administrador',
  'Secretário Municipal de Educação',
  'Superintendente / Diretor de Ensino',
  'Coordenador Pedagógico Municipal',
  'Diretor',
  'Vice-Diretor',
  'Coordenador Pedagógico',
  'Secretário Escolar',
]);

export function canManageAcademics(access) {
  return ACADEMIC_MANAGEMENT_PROFILES.has(access?.perfil);
}
