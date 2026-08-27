import { pool } from '../database.js';
import { canManageAcademics } from '../utils/accessPolicy.js';

export async function loadAccessContext(request, response, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.ativo,
        t.nome AS perfil,
        t.nivel,
        t.grupo,
        t.escopo_acesso,
        t.acesso_sistema,
        ARRAY_REMOVE(
          ARRAY_AGG(DISTINCT COALESCE(ue.escola_id, u.escola_id)),
          NULL
        ) AS escolas_permitidas
      FROM usuarios u
      JOIN tipos_usuarios t ON t.id = u.tipo_usuario_id
      LEFT JOIN usuario_escolas ue ON ue.usuario_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, t.nome, t.nivel, t.grupo, t.escopo_acesso, t.acesso_sistema
    `, [request.user.sub]);

    const access = rows[0];
    if (!access || !access.ativo) {
      return response.status(403).json({ message: 'Usuário inativo ou não encontrado.' });
    }

    request.access = {
      userId: access.id,
      nome: access.nome,
      perfil: access.perfil,
      nivel: access.nivel,
      grupo: access.grupo,
      escopo: access.escopo_acesso,
      acessoSistema: access.acesso_sistema,
      escolas: access.escolas_permitidas || [],
      municipal: access.nivel === 1 || access.escopo_acesso === 'municipal_total',
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function allowMunicipalAdmin(request, response, next) {
  if (!request.access?.municipal) {
    return response.status(403).json({
      message: 'Acesso exclusivo do Gestor, Superadministrador ou Secretário de Educação.',
    });
  }
  return next();
}

export function allowPedagogicalDashboard(request, response, next) {
  const pedagogicalProfiles = new Set([
    'Coordenador Pedagógico Municipal',
    'Coordenador Pedagógico',
    'Diretor',
    'Vice-Diretor',
    'Professor',
  ]);
  if (request.access?.municipal || pedagogicalProfiles.has(request.access?.perfil)) return next();
  return response.status(403).json({
    message: 'Acesso pedagógico disponível conforme o vínculo do usuário com a escola, turma ou disciplina.',
  });
}

export function allowSchoolStaff(request, response, next) {
  if (request.access?.municipal || request.access?.escolas.length) {
    return next();
  }
  return response.status(403).json({
    message: 'Seu perfil não possui uma unidade escolar vinculada.',
  });
}

export function allowAcademicManagement(request, response, next) {
  if (canManageAcademics(request.access)) {
    return next();
  }

  return response.status(403).json({
    message: 'Seu perfil não possui permissão para administrar cadastros acadêmicos.',
  });
}

export function canAccessSchool(request, schoolId) {
  return Boolean(
    request.access?.municipal
    || request.access?.escolas.includes(Number(schoolId)),
  );
}

export function requireSchoolAccess(schoolId) {
  return (request, response, next) => {
    if (request.access?.municipal || request.access?.escolas.includes(Number(schoolId))) {
      return next();
    }
    return response.status(403).json({
      message: 'Você não possui acesso a esta unidade escolar.',
    });
  };
}
