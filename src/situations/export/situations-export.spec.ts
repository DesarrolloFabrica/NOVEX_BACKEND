import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { UserStatus } from '../../common/enums/identity.enums';
import type { AuthPayload } from '../../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../../auth/services/operational-scope.service';
import { ExportSituationsQueryDto } from './situations-export.dto';
import {
  SITUATIONS_EXPORTED_AUDIT_ACTION,
  SituationsExportService,
} from './situations-export.service';
import {
  sanitizeCellText,
  toBogotaExcelDate,
} from './situations-export.workbook';

const NOW = new Date('2026-11-18T15:00:00.000Z');

function actor(
  roleCode: string,
  permissions = ['SITUATIONS_VIEW'],
): AuthPayload {
  return {
    sub: 'user-1',
    email: 'persona@test.novex.invalid',
    roleId: `role-${roleCode}`,
    roleCode,
    coordinationId: null,
    permissions,
    status: UserStatus.ACTIVE,
  };
}

const coordA = { id: 'c-a', name: 'Académica' };
const coordB = { id: 'c-b', name: 'Bienestar' };

function situation(overrides: Record<string, unknown>) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'Plataforma caída',
    description: 'No carga el aula virtual',
    reportKind: 'INTERNAL',
    status: 'OPEN',
    severity: 'HIGH',
    reportedSeverity: 'MEDIUM',
    category: { name: 'Tecnología' },
    categoryOtherText: null,
    coordination: coordA,
    coordinationId: coordA.id,
    affectedCoordination: coordA,
    relatedCoordinations: [],
    affectedProcess: null,
    pendingDelivery: null,
    createdByUser: { fullName: 'Ana Pérez' },
    assignedUser: null,
    occurredAt: new Date('2026-11-10T13:00:00.000Z'),
    createdAt: new Date('2026-11-10T13:05:00.000Z'),
    updatedAt: new Date('2026-11-11T13:05:00.000Z'),
    dueAt: new Date('2026-11-12T13:05:00.000Z'),
    lastStatusComment: null,
    ...overrides,
  };
}

function buildService(rows: unknown[], consequences: unknown[] = []) {
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  const situationsRepository = { createQueryBuilder: jest.fn(() => qb) };
  const consequencesRepository = {
    find: jest.fn().mockResolvedValue(consequences),
  };
  const coordinationsRepository = {
    find: jest.fn().mockResolvedValue([coordB]),
  };
  const usersRepository = {
    findOne: jest.fn().mockResolvedValue({ fullName: 'Directora General' }),
  };
  const audit = {
    record: jest.fn<Promise<null>, [unknown]>().mockResolvedValue(null),
  };
  const service = new SituationsExportService(
    situationsRepository as never,
    consequencesRepository as never,
    coordinationsRepository as never,
    usersRepository as never,
    new OperationalScopeService(),
    audit as never,
  );
  return { service, qb, audit, consequencesRepository };
}

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe('SituationsExportService', () => {
  it.each(['ADMIN', 'DIRECTOR', 'ANALISTA'])(
    'permite exportar a %s',
    (role) => {
      const { service } = buildService([]);
      expect(() => service.assertCanExport(actor(role))).not.toThrow();
    },
  );

  it('rechaza al COORDINADOR aunque tenga SITUATIONS_VIEW', async () => {
    const { service } = buildService([]);
    await expect(
      service.export({}, actor('COORDINADOR'), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza sin SITUATIONS_VIEW', () => {
    const { service } = buildService([]);
    expect(() => service.assertCanExport(actor('ADMIN', []))).toThrow(
      ForbiddenException,
    );
  });

  it('solo consulta estados activos y aplica los filtros pedidos', async () => {
    const { service, qb } = buildService([]);
    await service.export(
      {
        statuses: ['IN_PROGRESS'] as never,
        severities: ['CRITICAL'] as never,
        reportKinds: ['INTERNAL'] as never,
        coordinationIds: [coordB.id],
      },
      actor('ADMIN'),
      NOW,
    );
    expect(qb.where).toHaveBeenCalledWith(
      'situation.status IN (:...statuses)',
      {
        statuses: ['IN_PROGRESS'],
      },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'situation.coordinationId IN (:...coordinationIds)',
      { coordinationIds: [coordB.id] },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'situation.severity IN (:...severities)',
      {
        severities: ['CRITICAL'],
      },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'situation.reportKind IN (:...reportKinds)',
      { reportKinds: ['INTERNAL'] },
    );
  });

  it('sin estados pide OPEN e IN_PROGRESS (nunca cerradas ni anuladas)', async () => {
    const { service, qb } = buildService([]);
    await service.export({}, actor('DIRECTOR'), NOW);
    expect(qb.where).toHaveBeenCalledWith(
      'situation.status IN (:...statuses)',
      {
        statuses: ['OPEN', 'IN_PROGRESS'],
      },
    );
  });

  it('genera un xlsx legible con todas las hojas, categorías y afectaciones', async () => {
    const rows = [
      situation({}),
      situation({
        id: 'bbbbbbbb-0000-4000-8000-000000000002',
        title: 'Entrega de notas',
        reportKind: 'INTER_COORDINATION',
        status: 'IN_PROGRESS',
        severity: 'CRITICAL',
        category: null,
        coordination: coordB,
        coordinationId: coordB.id,
        affectedCoordination: coordA,
        affectedProcess: 'Cierre de periodo',
        pendingDelivery: 'Consolidado de notas',
        relatedCoordinations: [
          { displayOrder: 1, coordination: { name: 'Registro' } },
          { displayOrder: 0, coordination: { name: 'Admisiones' } },
        ],
      }),
      situation({
        id: 'cccccccc-0000-4000-8000-000000000003',
        title: 'Caso con «Otra»',
        severity: 'LOW',
        category: { name: 'Otra' },
        categoryOtherText: 'Mobiliario dañado',
        description: 'texto con control \u0007 incluido',
      }),
    ];
    const consequences = [
      {
        situationId: rows[0].id,
        occurredAt: new Date('2026-11-11T14:00:00.000Z'),
        createdAt: new Date('2026-11-11T14:01:00.000Z'),
        description: 'No se pudieron cargar archivos',
        createdByUser: { fullName: 'Luis Gómez' },
      },
    ];
    const { service, audit } = buildService(rows, consequences);

    const file = await service.export({}, actor('ANALISTA'), NOW);

    expect(file.filename).toBe(
      'NOVEX_situaciones_activas_2026-11-18_1000.xlsx',
    );
    expect(file.rows).toBe(3);

    const workbook = await readWorkbook(file.buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Resumen',
      'Situaciones',
      'Afectaciones',
      'Coordinaciones relacionadas',
    ]);

    const sheet = workbook.getWorksheet('Situaciones')!;
    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(
      expect.arrayContaining([
        'Categoría',
        'Coordinación responsable',
        'Coordinaciones relacionadas',
        'Severidad actual',
        'Estado del plazo',
        'Afectaciones',
      ]),
    );
    const col = (name: string) => headers.indexOf(name) + 1;
    // Orden: coordinación (Académica antes que Bienestar) y severidad.
    expect(sheet.getRow(2).getCell(col('Título')).value).toBe(
      'Plataforma caída',
    );
    expect(sheet.getRow(3).getCell(col('Título')).value).toBe(
      'Caso con «Otra»',
    );
    expect(sheet.getRow(4).getCell(col('Título')).value).toBe(
      'Entrega de notas',
    );
    expect(sheet.getRow(3).getCell(col('Categoría')).value).toBe(
      'Otra: Mobiliario dañado',
    );
    expect(sheet.getRow(3).getCell(col('Descripción')).value).toBe(
      'texto con control  incluido',
    );
    expect(
      sheet.getRow(4).getCell(col('Coordinaciones relacionadas')).value,
    ).toBe('Admisiones, Registro');
    expect(sheet.getRow(4).getCell(col('Tipo de registro')).value).toBe(
      'Dependencia entre coordinaciones',
    );
    expect(sheet.getRow(2).getCell(col('Afectaciones')).value).toBe(1);
    expect(sheet.getRow(2).getCell(col('Estado del plazo')).value).toBe(
      'Plazo vencido',
    );
    expect(sheet.getRow(2).getCell(col('Días abierta')).value).toBe(8);

    expect(workbook.getWorksheet('Afectaciones')!.rowCount).toBe(2);
    expect(workbook.getWorksheet('Coordinaciones relacionadas')!.rowCount).toBe(
      3,
    );

    // La auditoría registra filtros y conteos, nunca textos de las situaciones.
    const auditCall = audit.record.mock.calls[0]?.[0] as {
      action: string;
      metadata: { rows: number; consequences: number };
    };
    expect(auditCall.action).toBe(SITUATIONS_EXPORTED_AUDIT_ACTION);
    expect(auditCall.metadata.rows).toBe(3);
    expect(auditCall.metadata.consequences).toBe(1);
    expect(JSON.stringify(auditCall)).not.toContain('Plataforma');
  });

  it('respeta las hojas elegidas (solo Situaciones)', async () => {
    const { service } = buildService([situation({})]);
    const file = await service.export(
      { sheets: ['situations'] as never },
      actor('ADMIN'),
      NOW,
    );
    const workbook = await readWorkbook(file.buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Situaciones']);
  });
});

describe('ExportSituationsQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (value: Record<string, unknown>) =>
    pipe.transform(value, {
      type: 'query',
      metatype: ExportSituationsQueryDto,
    });

  it('acepta listas separadas por comas', async () => {
    const dto = (await validate({
      statuses: 'OPEN,IN_PROGRESS',
      severities: 'CRITICAL,HIGH',
      sheets: 'situations,summary',
      coordinationIds: 'aaaaaaaa-0000-4000-8000-000000000001',
    })) as ExportSituationsQueryDto;
    expect(dto.statuses).toEqual(['OPEN', 'IN_PROGRESS']);
    expect(dto.severities).toEqual(['CRITICAL', 'HIGH']);
    expect(dto.sheets).toEqual(['situations', 'summary']);
    expect(dto.coordinationIds).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000001',
    ]);
  });

  it('rechaza estados no activos', async () => {
    await expect(validate({ statuses: 'CLOSED' })).rejects.toBeDefined();
    await expect(validate({ statuses: 'CANCELLED' })).rejects.toBeDefined();
  });

  it('rechaza ids que no son UUID', async () => {
    await expect(
      validate({ coordinationIds: 'no-es-uuid' }),
    ).rejects.toBeDefined();
  });
});

describe('utilidades del libro', () => {
  it('expresa la hora en Bogotá', () => {
    expect(
      toBogotaExcelDate(new Date('2026-11-18T15:00:00.000Z'))?.toISOString(),
    ).toBe('2026-11-18T10:00:00.000Z');
  });

  it('limpia caracteres de control', () => {
    expect(sanitizeCellText('a\u0000b\u001Fc\nd')).toBe('abc\nd');
  });
});
