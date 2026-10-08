import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  SituationReportKind,
  SituationSeverity,
  SituationSeverityChangeSource,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Longitud máxima del aprendizaje. Se alinea con `description` y
 * `statusComment`, que ya usan 4000 en este mismo DTO: el aprendizaje es un
 * texto del mismo orden, no un campo corto de formulario.
 */
export const SITUATION_LEARNING_MAX_LENGTH = 4000;

/** Longitud máxima de una afectación (también la exige la base). */
export const SITUATION_CONSEQUENCE_MAX_LENGTH = 2000;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Afectación inicial del alta. Sin fecha propia: ocurre cuando ocurrió el
 * problema (`situation.occurred_at`).
 */
export class InitialConsequenceDto {
  @IsString()
  @Transform(trimString)
  @MinLength(1, { message: 'La afectación no puede estar vacía.' })
  @MaxLength(SITUATION_CONSEQUENCE_MAX_LENGTH)
  description!: string;
}

/** Afectación posterior (`POST /situations/:id/consequences`). */
export class CreateSituationConsequenceDto {
  @IsString()
  @Transform(trimString)
  @MinLength(1, { message: 'La afectación no puede estar vacía.' })
  @MaxLength(SITUATION_CONSEQUENCE_MAX_LENGTH)
  description!: string;

  /** Cuándo ocurrió. Por defecto, ahora. No futura ni anterior al problema. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class CreateSituationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  /**
   * Tipo de registro. OBLIGATORIO: ya no hay default silencioso a INTERNAL,
   * para que ningún cliente cree un problema interno sin decirlo.
   */
  @IsEnum(SituationReportKind)
  reportKind!: SituationReportKind;

  /**
   * Coordinación RESPONSABLE. Obligatoria en los dos tipos. En INTERNAL es la
   * carta seleccionada (y, para un COORDINADOR, siempre la suya); en INTER es
   * la externa que debe atender.
   */
  @IsUUID()
  coordinationId!: string;

  /**
   * Coordinación AFECTADA. Obligatoria en INTER (carta seleccionada). En
   * INTERNAL el servicio la iguala a la responsable si no viene.
   */
  @ValidateIf(
    (dto: CreateSituationDto) =>
      dto.reportKind === SituationReportKind.INTER_COORDINATION,
  )
  @IsUUID()
  affectedCoordinationId?: string;

  /** Obligatoria en INTERNAL; omitida en INTER (el tipo no se simula así). */
  @ValidateIf(
    (dto: CreateSituationDto) =>
      dto.reportKind !== SituationReportKind.INTER_COORDINATION,
  )
  @IsUUID()
  categoryId?: string;

  @IsEnum(SituationSeverity)
  severity!: SituationSeverity;

  @IsDateString()
  occurredAt!: string;

  /** Proceso de la afectada que se retrasa (INTER). */
  @ValidateIf(
    (dto: CreateSituationDto) =>
      dto.reportKind === SituationReportKind.INTER_COORDINATION,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  affectedProcess?: string;

  /** Entrega o acción pendiente de la responsable (INTER). */
  @ValidateIf(
    (dto: CreateSituationDto) =>
      dto.reportKind === SituationReportKind.INTER_COORDINATION,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  pendingDelivery?: string;

  /**
   * Coordinaciones que el usuario declara como potencialmente relacionadas.
   * Opcional; si se envían, tienen prioridad sobre cualquier simulación IA.
   * Tope amplio para permitir marcar todo el catálogo institucional si aplica.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('4', { each: true })
  relatedCoordinationIds?: string[];

  /** Solo INTERNAL. Opcional: un problema puede nacer sin afectaciones. */
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialConsequenceDto)
  initialConsequence?: InitialConsequenceDto;
}

export class RelatedCoordinationResponseDto {
  id!: string;
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  coordinationShortName!: string;
  displayOrder!: number;
}

/**
 * PATCH de una situación.
 *
 * `categoryId` y `severity` NO existen aquí, a propósito: la categoría es
 * inmutable tras el alta y la severidad solo la cambia el sistema (historial
 * append-only). Con `forbidNonWhitelisted`, enviarlas devuelve 400.
 */
export class UpdateSituationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  /** Motivo de resolución o comentario de cierre (obligatorio según el estado). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  statusComment?: string;

  /**
   * Estructura preparada para adjuntar evidencias en futuras iteraciones.
   * Hoy solo se registra en el historial operacional; no valida ni asocia archivos.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceIds?: string[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

/**
 * Entrada de la operación de resolución.
 *
 * El aprendizaje es el ÚNICO dato que aporta el usuario: el estado final
 * (`CLOSED`), la fecha y la identidad de quien resuelve los determina el
 * servidor. En particular NO se acepta aquí ninguna coordinación: la
 * autorización se decide con la coordinación responsable PERSISTIDA del
 * problema, nunca con una enviada por el cliente.
 *
 * `@MinLength(1)` sobre el valor ya recortado por `@Transform` rechaza un
 * aprendizaje compuesto solo de espacios, que es el caso que la validación de
 * longitud cruda dejaría pasar.
 */
export class ResolveSituationDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'El aprendizaje no puede estar vacío.' })
  @MaxLength(SITUATION_LEARNING_MAX_LENGTH)
  learning!: string;
}

export class SituationResolutionResponseDto {
  /** Qué se aprendió al solucionar el problema. */
  learning!: string;
  resolvedByUserId!: string;
  resolvedByUserName!: string;
  /** Instante del cierre. Sale de `situations.resolved_at`. */
  resolvedAt!: Date | null;
  /** Alta de la fila de aprendizaje. */
  recordedAt!: Date;
}

export class ListSituationsQueryDto extends PaginationQueryDto {
  /**
   * «Mis reportes»: limita el listado a los casos que creó QUIEN HACE la
   * petición, en cualquier coordinación.
   *
   * Es un interruptor booleano, no un identificador de autor. La identidad la
   * pone el servidor con `actor.sub`; aceptar aquí un `createdByUserId` habría
   * convertido este filtro en una vía para leer los reportes de otra persona.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  @IsOptional()
  @IsEnum(SituationSeverity)
  severity?: SituationSeverity;

  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  /**
   * Historial por fecha de cierre. Filtra `closed_at` (no `occurred_at`).
   * Pensado para `status=CLOSED`; si no se envía status, igual acota por cierre.
   */
  @IsOptional()
  @IsDateString()
  closedFrom?: string;

  @IsOptional()
  @IsDateString()
  closedTo?: string;
}

export class SituationResponseDto {
  id!: string;
  title!: string;
  description!: string;
  /** Tipo de registro. Los históricos viajan como INTERNAL. */
  reportKind!: SituationReportKind;
  /** Coordinación RESPONSABLE (quien atiende / puede resolver). */
  coordinationId!: string | null;
  coordinationCode!: string | null;
  coordinationName!: string | null;
  /** Coordinación AFECTADA (impacto). En INTERNAL coincide con la responsable. */
  affectedCoordinationId!: string | null;
  affectedCoordinationCode!: string | null;
  affectedCoordinationName!: string | null;
  affectedProcess!: string | null;
  pendingDelivery!: string | null;
  createdByUserId!: string;
  createdByUserName!: string;
  assignedUserId!: string | null;
  assignedUserName!: string | null;
  categoryId!: string | null;
  categoryCode!: string | null;
  categoryName!: string | null;
  categoryIcon!: string | null;
  /** Categoría vigente en el catálogo (false = legacy, solo lectura). */
  categorySelectable!: boolean | null;
  /** Severidad EFECTIVA: el nivel operacional actual. */
  severity!: SituationSeverity;
  /** Severidad REPORTADA al registrar. Inmutable; es la base del SLA. */
  reportedSeverity!: SituationSeverity;
  status!: SituationStatus;
  lastStatusComment!: string | null;
  resolvedAt!: Date | null;
  closedAt!: Date | null;
  dueAt!: Date | null;
  slaPolicyCode!: string | null;
  slaBreachedAt!: Date | null;
  /** Salud SLA derivada: on_track | at_risk | overdue | closed */
  slaHealth!: 'on_track' | 'at_risk' | 'overdue' | 'closed';
  /** Solo en CLOSED: si closedAt <= dueAt */
  closedOnTime!: boolean | null;
  occurredAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
  relatedCoordinations!: RelatedCoordinationResponseDto[];
  /**
   * Resolución con aprendizaje, o `null`. Es `null` tanto en los problemas
   * activos como en los CERRADOS ANTES de esta fase: la ausencia es legítima y
   * no se rellena con texto inventado.
   */
  resolution!: SituationResolutionResponseDto | null;
  /**
   * Si el USUARIO DE ESTA PETICIÓN puede solucionar el problema. Lo calcula la
   * misma política que autoriza el endpoint (`canResolveSituation`), de modo
   * que la interfaz no puede divergir del backend. Es una PISTA para la UI: la
   * autorización definitiva la sigue aplicando el servidor en cada escritura.
   */
  canResolve!: boolean;
  /**
   * Si puede avanzar OPEN → IN_PROGRESS. Misma política que
   * `assertCanAdvanceSituationToInProgress` (COORDINADOR responsable o
   * ANALISTA cuando General es responsable). Independiente de `canUpdate`
   * (autoría / otras ediciones) y de `canResolve`.
   */
  canAdvanceToInProgress!: boolean;
  /**
   * Si el USUARIO DE ESTA PETICIÓN puede aplicar otras actualizaciones vía
   * PATCH (campos / autoría u ownership). No sustituye a
   * `canAdvanceToInProgress` para el botón «En atención».
   */
  canUpdate!: boolean;
  /**
   * Si puede registrar una afectación. Misma política que autoriza
   * `POST /situations/:id/consequences` (`canAddConsequence`); la interfaz no
   * la reconstruye.
   */
  canAddConsequence!: boolean;
}

/** Un nivel del historial de severidad. */
export class SituationSeverityHistoryItemDto {
  id!: string;
  /** Nivel anterior; nulo en la fila `REPORTED`. */
  from!: SituationSeverity | null;
  to!: SituationSeverity;
  source!: SituationSeverityChangeSource;
  /** Desde cuándo rige el nivel. */
  effectiveAt!: Date;
  /** Cuándo lo registró el sistema. */
  recordedAt!: Date;
  policyCode!: string | null;
  ruleKey!: string | null;
}

/** Una afectación, con la severidad que regía cuando ocurrió (derivada). */
export class SituationConsequenceResponseDto {
  id!: string;
  situationId!: string;
  description!: string;
  occurredAt!: Date;
  createdAt!: Date;
  createdByUserId!: string;
  createdByUserName!: string;
  createdByRoleName!: string | null;
  /** Derivada de `situation_severity_changes`; no se persiste. */
  severityAtOccurrence!: SituationSeverity | null;
}

/**
 * Detalle de una situación (`GET /situations/:id` y respuestas de escritura).
 * Extiende el ítem de listado con lo que solo tiene sentido al abrir un caso.
 */
export class SituationDetailResponseDto extends SituationResponseDto {
  /** Orden por `effectiveAt` ascendente; la primera fila es `REPORTED`. */
  severityHistory!: SituationSeverityHistoryItemDto[];
  /** Orden por `occurredAt` ascendente, desempate por `createdAt` e `id`. */
  consequences!: SituationConsequenceResponseDto[];
  consequenceCount!: number;
}

/**
 * Alcance con el que se resolvió el listado.
 *
 *   complete  El filtro pedido se aplicó tal cual: lo devuelto es TODO lo que
 *             hay para esa consulta.
 *   own-only  El actor no puede leer los problemas de esa coordinación, así que
 *             se le devolvieron ÚNICAMENTE los que él mismo reportó. `total`
 *             cuenta ese subconjunto, no los problemas del área.
 *
 * Lo declara el servidor para que la interfaz no tenga que deducir la política
 * por su cuenta: una lista vacía significa cosas distintas en cada caso y el
 * mensaje que se muestra depende de esta diferencia.
 */
export type SituationsListScope = 'complete' | 'own-only';

export class SituationsListResponseDto {
  items!: SituationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
  scope!: SituationsListScope;
}

export class IncidentCategorySummaryDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  isSelectable!: boolean;
  icon!: string;
}
