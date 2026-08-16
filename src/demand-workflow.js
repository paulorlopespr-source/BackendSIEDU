export const DEMAND_PROFILES = Object.freeze({
  SUPER_ADMIN: 'Super Administrador',
  EDUCATION_SECRETARY: 'Secretário Municipal de Educação',
  ADMINISTRATION: 'Secretaria Administrativa da Educação',
  DIRECTOR: 'Diretor',
  VICE_DIRECTOR: 'Vice-Diretor',
});

const directorProfiles = new Set([
  DEMAND_PROFILES.DIRECTOR,
]);
const educationProfiles = new Set([
  DEMAND_PROFILES.SUPER_ADMIN,
  DEMAND_PROFILES.EDUCATION_SECRETARY,
]);

export const canCreateSchoolDemand = (access) => directorProfiles.has(access?.perfil);
export const canDecideSchoolDemand = (access) => educationProfiles.has(access?.perfil);
export const canExecuteSchoolDemand = (access) => [DEMAND_PROFILES.ADMINISTRATION, 'Técnico da Secretaria de Educação'].includes(access?.perfil);
export const canAccessDemandWorkflow = (access) => (
  canCreateSchoolDemand(access)
  || canDecideSchoolDemand(access)
  || canExecuteSchoolDemand(access)
);

export const secretaryDecisionStatus = Object.freeze({
  autorizar: 'Autorizada para execução',
  analisar: 'Em análise pela Secretaria',
  pendente: 'Pendente na Secretaria',
});

export const administrationStatus = Object.freeze({
  pendente: 'Pendente na Administração',
  concluir: 'Demanda resolvida',
});

export function statusForSecretaryDecision(currentStatus, action) {
  const allowedCurrent = new Set([
    'Enviada à Secretaria',
    'Em análise pela Secretaria',
    'Pendente na Secretaria',
  ]);
  if (!allowedCurrent.has(currentStatus)) return null;
  return secretaryDecisionStatus[action] || null;
}

export function statusForAdministration(currentStatus, action) {
  const allowedCurrent = new Set([
    'Autorizada para execução',
    'Pendente na Administração',
  ]);
  if (!allowedCurrent.has(currentStatus)) return null;
  return administrationStatus[action] || null;
}

export function urgencyColor(urgency) {
  if (urgency === 'Alta') return 'vermelho';
  if (urgency === 'Normal') return 'verde';
  return 'cinza';
}
