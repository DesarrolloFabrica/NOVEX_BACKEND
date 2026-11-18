import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthPayload } from '../../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../../auth/services/operational-scope.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { User } from '../../users/entities/user.entity';
import { Situation } from '../entities/situation.entity';
import { SituationConsequence } from '../entities/situation-consequence.entity';
import { computeSlaHealth } from '../situation-sla.policy';
import {
  EXPORTABLE_ACTIVE_STATUSES,
  ExportSituationsQueryDto,
  SITUATIONS_EXPORT_MAX_ROWS,
  SITUATIONS_EXPORT_ROLES,
  SITUATIONS_EXPORT_SHEETS,
  type SituationsExportSheet,
} from './situations-export.dto';
import {
  buildSituationsWorkbook,
  REPORT_KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  STATUS_LABEL,
  type ExportConsequenceRow,
  type ExportRelatedRow,
  type ExportSituationRow,
} from './situations-export.workbook';

export const SITUATIONS_EXPORTED_AUDIT_ACTION = 'SITUATIONS_EXPORTED';

export interface SituationsExportFile {
  buffer: Buffer;
  filename: string;
  rows: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-11-18_0830` en hora de Bogotá, para el nombre del archivo. */
function bogotaStamp(date: Date): string {
  const local = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const iso = local.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/**
 * Exportación a Excel de las situaciones ACTIVAS (OPEN / IN_PROGRESS).
 *
 * Solo para los roles que ya leen el registro institucional completo
 * (ADMIN, DIRECTOR, ANALISTA) y con `SITUATIONS_VIEW`: no abre ninguna lectura
 * nueva, solo empaqueta lo que esos roles ya consultan en pantalla. Las
 * anuladas y cerradas quedan fuera por definición de «activa».
 */
@Injectable()
export class SituationsExportService {
  private readonly logger = new Logger(SituationsExportService.name);

  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    @InjectRepository(SituationConsequence)
    private readonly consequencesRepository: Repository<SituationConsequence>,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly scopeService: OperationalScopeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  assertCanExport(actor: AuthPayload): void {
    this.scopeService.assertPermission(actor, 'SITUATIONS_VIEW');
    const role = actor.roleCode?.trim().toUpperCase();
    if (!SITUATIONS_EXPORT_ROLES.includes(role)) {
      throw new ForbiddenException(
        'La exportación de situaciones está disponible para Administración, Dirección y Análisis de Operaciones.',
      );
    }
  }

  async export(
    query: ExportSituationsQueryDto,
    actor: AuthPayload,
    now: Date = new Date(),
  ): Promise<SituationsExportFile> {
    this.assertCanExport(actor);

    const statuses =
      query.statuses && query.statuses.length > 0
        ? query.statuses
        : [...EXPORTABLE_ACTIVE_STATUSES];
    const sheets = new Set<SituationsExportSheet>(
      query.sheets && query.sheets.length > 0
        ? query.sheets
        : SITUATIONS_EXPORT_SHEETS,
    );
    sheets.add('situations');

    const qb = this.situationsRepository
      .createQueryBuilder('situation')
      .leftJoinAndSelect('situation.coordination', 'coordination')
      .leftJoinAndSelect(
        'situation.affectedCoordination',
        'affectedCoordination',
      )
      .leftJoinAndSelect('situation.createdByUser', 'createdByUser')
      .leftJoinAndSelect('situation.assignedUser', 'assignedUser')
      .leftJoinAndSelect('situation.category', 'category')
      .leftJoinAndSelect(
        'situation.relatedCoordinations',
        'relatedCoordinations',
      )
      .leftJoinAndSelect(
        'relatedCoordinations.coordination',
        'relatedCoordination',
      )
      .where('situation.status IN (:...statuses)', { statuses });

    if (query.coordinationIds?.length) {
      qb.andWhere('situation.coordinationId IN (:...coordinationIds)', {
        coordinationIds: query.coordinationIds,
      });
    }
    if (query.severities?.length) {
      qb.andWhere('situation.severity IN (:...severities)', {
        severities: query.severities,
      });
    }
    if (query.reportKinds?.length) {
      qb.andWhere('situation.reportKind IN (:...reportKinds)', {
        reportKinds: query.reportKinds,
      });
    }

    const situations = await qb
      .orderBy('situation.occurredAt', 'ASC')
      .addOrderBy('situation.id', 'ASC')
      .getMany();

    // Orden de lectura: coordinación, severidad (crítica primero), antigüedad.
    const severityRank = (severity: string) => {
      const index = SEVERITY_ORDER.indexOf(
        severity as (typeof SEVERITY_ORDER)[number],
      );
      return index === -1 ? SEVERITY_ORDER.length : index;
    };
    situations.sort(
      (a, b) =>
        (a.coordination?.name ?? '~').localeCompare(
          b.coordination?.name ?? '~',
          'es',
        ) ||
        severityRank(a.severity) - severityRank(b.severity) ||
        a.occurredAt.getTime() - b.occurredAt.getTime(),
    );

    const truncated = situations.length > SITUATIONS_EXPORT_MAX_ROWS;
    const selected = truncated
      ? situations.slice(0, SITUATIONS_EXPORT_MAX_ROWS)
      : situations;
    const ids = selected.map((s) => s.id);

    const consequences = ids.length
      ? await this.consequencesRepository.find({
          where: { situationId: In(ids) },
          relations: { createdByUser: true },
          order: { occurredAt: 'ASC', createdAt: 'ASC' },
        })
      : [];
    const consequencesBySituation = new Map<string, SituationConsequence[]>();
    for (const consequence of consequences) {
      const list = consequencesBySituation.get(consequence.situationId) ?? [];
      list.push(consequence);
      consequencesBySituation.set(consequence.situationId, list);
    }

    const situationRows: ExportSituationRow[] = selected.map((situation) => {
      const own = consequencesBySituation.get(situation.id) ?? [];
      const related = [...(situation.relatedCoordinations ?? [])].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      return {
        id: situation.id,
        code: situation.id.slice(0, 8).toUpperCase(),
        title: situation.title,
        description: situation.description,
        reportKind: situation.reportKind,
        status: situation.status,
        severity: situation.severity,
        reportedSeverity: situation.reportedSeverity,
        categoryName: situation.category?.name ?? null,
        categoryOtherText: situation.categoryOtherText ?? null,
        responsibleCoordinationName: situation.coordination?.name ?? null,
        affectedCoordinationName: situation.affectedCoordination?.name ?? null,
        relatedCoordinationNames: related
          .map((item) => item.coordination?.name)
          .filter((name): name is string => Boolean(name)),
        affectedProcess: situation.affectedProcess ?? null,
        pendingDelivery: situation.pendingDelivery ?? null,
        createdByName: situation.createdByUser?.fullName ?? '',
        assignedName: situation.assignedUser?.fullName ?? null,
        occurredAt: situation.occurredAt,
        createdAt: situation.createdAt,
        updatedAt: situation.updatedAt,
        dueAt: situation.dueAt ?? null,
        slaHealth: computeSlaHealth(
          situation.dueAt,
          situation.status,
          now,
          situation.reportedSeverity,
        ),
        daysOpen: Math.max(
          0,
          Math.floor((now.getTime() - situation.occurredAt.getTime()) / DAY_MS),
        ),
        consequencesCount: own.length,
        lastConsequenceAt: own.length ? own[own.length - 1].occurredAt : null,
        lastStatusComment: situation.lastStatusComment ?? null,
      };
    });

    const byId = new Map(situationRows.map((row) => [row.id, row]));

    const consequenceRows: ExportConsequenceRow[] = consequences.map((c) => {
      const parent = byId.get(c.situationId);
      return {
        situationCode: parent?.code ?? '',
        situationTitle: parent?.title ?? '',
        responsibleCoordinationName:
          parent?.responsibleCoordinationName ?? null,
        severity: parent?.severity ?? '',
        occurredAt: c.occurredAt,
        createdAt: c.createdAt,
        description: c.description,
        createdByName: c.createdByUser?.fullName ?? '',
      };
    });

    const relatedRows: ExportRelatedRow[] = situationRows.flatMap((row) =>
      row.relatedCoordinationNames.map((name, index) => ({
        situationCode: row.code,
        situationTitle: row.title,
        responsibleCoordinationName: row.responsibleCoordinationName,
        relatedCoordinationName: name,
        order: index + 1,
      })),
    );

    const filters = await this.describeFilters(query, statuses);
    const generatedBy = await this.resolveActorName(actor);

    const workbook = buildSituationsWorkbook({
      generatedAt: now,
      generatedBy,
      generatedByRole: actor.roleCode,
      filters,
      sheets,
      situations: situationRows,
      consequences: consequenceRows,
      related: relatedRows,
      truncated,
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // Exportar datos es un evento sensible pero no crítico: no se bloquea la
    // descarga si la auditoría falla. Sin textos: solo filtros y conteos.
    await this.auditLogService.record({
      actor,
      action: SITUATIONS_EXPORTED_AUDIT_ACTION,
      resourceType: 'situation',
      resourceId: null,
      metadata: {
        format: 'xlsx',
        rows: situationRows.length,
        consequences: consequenceRows.length,
        truncated,
        statuses,
        severities: query.severities ?? null,
        reportKinds: query.reportKinds ?? null,
        coordinationIds: query.coordinationIds ?? null,
        sheets: Array.from(sheets),
      },
    });

    this.logger.log(
      `Exportación xlsx: ${situationRows.length} situaciones, rol ${actor.roleCode}`,
    );

    return {
      buffer,
      filename: `NOVEX_situaciones_activas_${bogotaStamp(now)}.xlsx`,
      rows: situationRows.length,
    };
  }

  private async describeFilters(
    query: ExportSituationsQueryDto,
    statuses: readonly string[],
  ): Promise<Array<[string, string]>> {
    let coordinationsLabel = 'Todas';
    if (query.coordinationIds?.length) {
      const coordinations = await this.coordinationsRepository.find({
        where: { id: In(query.coordinationIds) },
      });
      coordinationsLabel =
        coordinations
          .map((c) => c.name)
          .sort((a, b) => a.localeCompare(b, 'es'))
          .join(', ') || 'Ninguna encontrada';
    }
    return [
      ['Coordinaciones', coordinationsLabel],
      ['Estados', statuses.map((s) => STATUS_LABEL[s] ?? s).join(', ')],
      [
        'Severidad',
        query.severities?.length
          ? query.severities.map((s) => SEVERITY_LABEL[s] ?? s).join(', ')
          : 'Todas',
      ],
      [
        'Tipo de registro',
        query.reportKinds?.length
          ? query.reportKinds.map((k) => REPORT_KIND_LABEL[k] ?? k).join(', ')
          : 'Todos',
      ],
    ];
  }

  private async resolveActorName(actor: AuthPayload): Promise<string> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: actor.sub },
      });
      return user?.fullName ?? actor.email;
    } catch {
      return actor.email;
    }
  }
}
