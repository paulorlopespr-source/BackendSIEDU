import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database.js';
import { authenticate } from '../middlewares/auth.js';
import { allowMunicipalAdmin, loadAccessContext } from '../middlewares/access.js';
import { cpfSchema } from '../utils/validation.js';

const router = Router();
router.use(authenticate, loadAccessContext, allowMunicipalAdmin);

const optionalText = z.string().trim().optional().transform((value) => value || null);
const optionalPositiveInteger = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.coerce.number().int().nonnegative().nullable(),
);
const optionalPositiveNumber = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.coerce.number().nonnegative().nullable(),
);
const optionalCpf = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  cpfSchema.nullable(),
);

router.get('/', async (_request, response, next) => {
  try {
    const [vehicles, drivers, attendants, routes, students, maintenance, schools] = await Promise.all([
      pool.query(`
        SELECT id, prefixo, placa, tipo, marca_modelo, ano_fabricacao, capacidade,
          estado, situacao_propriedade, foto_url, ultima_manutencao,
          proxima_manutencao, quilometragem, itens_manutencao, ativo
        FROM veiculos_transporte
        ORDER BY prefixo
      `),
      pool.query(`
        SELECT id, nome, cpf, cnh, telefone, validade_cnh, ativo
        FROM motoristas_transporte
        ORDER BY nome
      `),
      pool.query(`
        SELECT id, nome, cpf, telefone, ativo
        FROM acompanhantes_transporte
        ORDER BY nome
      `),
      pool.query(`
        SELECT
          r.id, r.nome, r.descricao, r.turno, r.distancia_km, r.origem,
          r.destino, r.horario_saida, r.horario_chegada, r.dias_semana,
          r.pontos_parada, r.ativo, r.veiculo_id, r.motorista_id,
          r.acompanhante_id, v.prefixo AS veiculo, m.nome AS motorista,
          a.nome AS acompanhante,
          COUNT(ar.id)::int AS total_alunos
        FROM rotas_transporte r
        JOIN veiculos_transporte v ON v.id = r.veiculo_id
        JOIN motoristas_transporte m ON m.id = r.motorista_id
        LEFT JOIN acompanhantes_transporte a ON a.id = r.acompanhante_id
        LEFT JOIN alunos_rotas_transporte ar ON ar.rota_id = r.id AND ar.ativo
        GROUP BY r.id, v.prefixo, m.nome, a.nome
        ORDER BY r.nome
      `),
      pool.query(`
        SELECT ar.id, ar.rota_id, ar.escola_id, ar.matricula, ar.nome,
          ar.turma, ar.responsavel, ar.contato_responsavel,
          ar.ponto_embarque, ar.ponto_desembarque, ar.ativo,
          r.nome AS rota, e.nome AS escola
        FROM alunos_rotas_transporte ar
        JOIN rotas_transporte r ON r.id = ar.rota_id
        LEFT JOIN escolas e ON e.id = ar.escola_id
        ORDER BY r.nome, ar.nome
      `),
      pool.query(`
        SELECT mt.id, mt.veiculo_id, mt.tipo, mt.descricao, mt.itens_servicos,
          mt.fornecedor, mt.data_manutencao, mt.quilometragem,
          mt.valor::float8, mt.numero_nota_fiscal, mt.comprovante_arquivo,
          mt.proxima_manutencao, mt.status, mt.criado_em,
          v.prefixo AS veiculo, v.placa
        FROM manutencoes_veiculos_transporte mt
        JOIN veiculos_transporte v ON v.id = mt.veiculo_id
        ORDER BY mt.data_manutencao DESC, mt.id DESC
      `),
      pool.query('SELECT id, nome FROM escolas ORDER BY nome'),
    ]);

    return response.json({
      vehicles: vehicles.rows,
      drivers: drivers.rows,
      attendants: attendants.rows,
      routes: routes.rows,
      students: students.rows,
      maintenance: maintenance.rows,
      schools: schools.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/vehicles', async (request, response, next) => {
  try {
    const data = z.object({
      prefixo: z.string().trim().min(2),
      placa: optionalText,
      tipo: z.string().trim().min(2),
      marcaModelo: optionalText,
      anoFabricacao: optionalPositiveInteger,
      capacidade: optionalPositiveInteger,
      estado: z.string().trim().min(2),
      situacaoPropriedade: z.enum(['Locado', 'Prefeitura']),
      fotoUrl: optionalText,
      ultimaManutencao: optionalText,
      proximaManutencao: optionalText,
      quilometragem: optionalPositiveInteger,
      itensManutencao: optionalText,
      secretariaId: z.coerce.number().int().positive().optional().nullable(),
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO veiculos_transporte (
        prefixo, placa, tipo, marca_modelo, ano_fabricacao, capacidade, estado,
        situacao_propriedade, foto_url, ultima_manutencao, proxima_manutencao,
        quilometragem, itens_manutencao, secretaria_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      data.prefixo,
      data.placa,
      data.tipo,
      data.marcaModelo,
      data.anoFabricacao,
      data.capacidade,
      data.estado,
      data.situacaoPropriedade,
      data.fotoUrl,
      data.ultimaManutencao,
      data.proximaManutencao,
      data.quilometragem,
      data.itensManutencao,
      data.secretariaId,
    ]);
    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/drivers', async (request, response, next) => {
  try {
    const data = z.object({
      nome: z.string().trim().min(3),
      cpf: optionalCpf,
      cnh: z.string().trim().min(3),
      telefone: optionalText,
      validadeCnh: optionalText,
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO motoristas_transporte (nome, cpf, cnh, telefone, validade_cnh)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [data.nome, data.cpf, data.cnh, data.telefone, data.validadeCnh]);
    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/attendants', async (request, response, next) => {
  try {
    const data = z.object({
      nome: z.string().trim().min(3),
      cpf: optionalCpf,
      telefone: optionalText,
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO acompanhantes_transporte (nome, cpf, telefone)
      VALUES ($1,$2,$3)
      RETURNING *
    `, [data.nome, data.cpf, data.telefone]);
    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/routes', async (request, response, next) => {
  try {
    const data = z.object({
      nome: z.string().trim().min(3),
      descricao: optionalText,
      turno: z.string().trim().min(3),
      distanciaKm: optionalPositiveNumber,
      origem: z.string().trim().min(3),
      destino: z.string().trim().min(3),
      horarioSaida: optionalText,
      horarioChegada: optionalText,
      diasSemana: z.string().trim().min(3),
      pontosParada: z.array(z.string().trim().min(2)).default([]),
      veiculoId: z.coerce.number().int().positive(),
      motoristaId: z.coerce.number().int().positive(),
      acompanhanteId: z.coerce.number().int().positive().optional().nullable(),
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO rotas_transporte (
        nome, descricao, turno, distancia_km, origem, destino,
        horario_saida, horario_chegada, dias_semana, pontos_parada,
        veiculo_id, motorista_id, acompanhante_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
      RETURNING *
    `, [
      data.nome,
      data.descricao,
      data.turno,
      data.distanciaKm,
      data.origem,
      data.destino,
      data.horarioSaida,
      data.horarioChegada,
      data.diasSemana,
      JSON.stringify(data.pontosParada),
      data.veiculoId,
      data.motoristaId,
      data.acompanhanteId,
    ]);
    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/routes/:id/students', async (request, response, next) => {
  try {
    const routeId = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({
      escolaId: z.coerce.number().int().positive().optional().nullable(),
      matricula: z.string().trim().min(3),
      nome: z.string().trim().min(3),
      turma: optionalText,
      responsavel: z.string().trim().min(3),
      contatoResponsavel: z.string().trim().min(8),
      pontoEmbarque: z.string().trim().min(3),
      pontoDesembarque: optionalText,
    }).parse(request.body);

    const route = await pool.query('SELECT id FROM rotas_transporte WHERE id = $1', [routeId]);
    if (!route.rows[0]) return response.status(404).json({ message: 'Rota não encontrada.' });

    const { rows } = await pool.query(`
      INSERT INTO alunos_rotas_transporte (
        rota_id, escola_id, matricula, nome, turma, responsavel,
        contato_responsavel, ponto_embarque, ponto_desembarque
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      routeId,
      data.escolaId,
      data.matricula,
      data.nome,
      data.turma,
      data.responsavel,
      data.contatoResponsavel,
      data.pontoEmbarque,
      data.pontoDesembarque,
    ]);
    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/maintenance', async (request, response, next) => {
  try {
    const data = z.object({
      veiculoId: z.coerce.number().int().positive(),
      tipo: z.enum(['Preventiva', 'Corretiva', 'Inspecao']),
      descricao: z.string().trim().min(5),
      itensServicos: z.string().trim().min(3),
      fornecedor: optionalText,
      dataManutencao: z.string().date(),
      quilometragem: optionalPositiveInteger,
      valor: optionalPositiveNumber,
      numeroNotaFiscal: optionalText,
      comprovanteArquivo: optionalText,
      proximaManutencao: optionalText,
      status: z.enum(['Agendada', 'Em andamento', 'Concluida', 'Cancelada']),
    }).parse(request.body);

    const { rows } = await pool.query(`
      INSERT INTO manutencoes_veiculos_transporte (
        veiculo_id, tipo, descricao, itens_servicos, fornecedor,
        data_manutencao, quilometragem, valor, numero_nota_fiscal,
        comprovante_arquivo, proxima_manutencao, status, registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      data.veiculoId,
      data.tipo,
      data.descricao,
      data.itensServicos,
      data.fornecedor,
      data.dataManutencao,
      data.quilometragem,
      data.valor,
      data.numeroNotaFiscal,
      data.comprovanteArquivo,
      data.proximaManutencao,
      data.status,
      request.access.userId,
    ]);

    if (data.status === 'Concluida') {
      await pool.query(`
        UPDATE veiculos_transporte
        SET ultima_manutencao = $1,
            proxima_manutencao = $2,
            quilometragem = COALESCE($3, quilometragem),
            itens_manutencao = $4,
            estado = 'Em operacao'
        WHERE id = $5
      `, [data.dataManutencao, data.proximaManutencao, data.quilometragem, data.itensServicos, data.veiculoId]);
    } else if (data.status === 'Em andamento') {
      await pool.query(
        "UPDATE veiculos_transporte SET estado = 'Em manutencao' WHERE id = $1",
        [data.veiculoId],
      );
    }

    return response.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.patch('/maintenance/:id/status', async (request, response, next) => {
  try {
    const maintenanceId = z.coerce.number().int().positive().parse(request.params.id);
    const data = z.object({
      status: z.enum(['Agendada', 'Em andamento', 'Concluida', 'Cancelada']),
    }).parse(request.body);

    const { rows } = await pool.query(`
      UPDATE manutencoes_veiculos_transporte
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [data.status, maintenanceId]);

    if (!rows[0]) return response.status(404).json({ message: 'Manutenção não encontrada.' });

    if (data.status === 'Em andamento') {
      await pool.query(
        "UPDATE veiculos_transporte SET estado = 'Em manutencao' WHERE id = $1",
        [rows[0].veiculo_id],
      );
    }

    if (data.status === 'Concluida') {
      await pool.query(`
        UPDATE veiculos_transporte
        SET ultima_manutencao = $1,
            proxima_manutencao = $2,
            quilometragem = COALESCE($3, quilometragem),
            itens_manutencao = $4,
            estado = 'Em operacao'
        WHERE id = $5
      `, [
        rows[0].data_manutencao,
        rows[0].proxima_manutencao,
        rows[0].quilometragem,
        rows[0].itens_servicos,
        rows[0].veiculo_id,
      ]);
    }

    return response.json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
