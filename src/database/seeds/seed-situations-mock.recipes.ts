import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';

/**
 * Perfil visual de cada isla en Red de impacto.
 * El frontend toma la situación vigente más severa (y su SLA); si una crítica
 * declara coordinaciones relacionadas, esas islas heredan el mismo estado.
 */
export type IslandMockProfile = 'critical' | 'high' | 'attention' | 'normal';

export interface MockSituationRecipe {
  originProfile: IslandMockProfile;
  severity: SituationSeverity;
  status: SituationStatus;
  sla: 'on_track' | 'at_risk' | 'overdue';
  relateWithinProfile: boolean;
}

const ISLAND_PROFILE_BY_CODE: Readonly<Record<string, IslandMockProfile>> = {
  'coord-fabrica-contenidos': 'critical',
  'coord-operaciones-academicas': 'critical',
  'coord-homologaciones': 'high',
  'coord-ingenierias': 'high',
  'coord-especializaciones': 'high',
  'coord-servicios': 'attention',
  'coord-b2b': 'attention',
  'coord-negocios': 'attention',
  'coord-bellas-artes': 'attention',
};

export function resolveIslandMockProfile(code: string): IslandMockProfile {
  return ISLAND_PROFILE_BY_CODE[code] ?? 'normal';
}

/**
 * Ciclo de 10 recetas: 2 críticas, 2 altas, 3 en atención y 3 cerradas
 * (islas normales). No escala criticidad por volumen ni por impacto cruzado
 * hacia coordinaciones estables.
 */
export function recipeForMockIndex(index: number): MockSituationRecipe {
  const bucket = index % 10;
  switch (bucket) {
    case 0:
      return {
        originProfile: 'critical',
        severity: SituationSeverity.CRITICAL,
        status: SituationStatus.OPEN,
        sla: 'overdue',
        relateWithinProfile: true,
      };
    case 1:
      return {
        originProfile: 'high',
        severity: SituationSeverity.HIGH,
        status: SituationStatus.OPEN,
        sla: 'on_track',
        relateWithinProfile: true,
      };
    case 2:
      return {
        originProfile: 'attention',
        severity: SituationSeverity.MEDIUM,
        status: SituationStatus.OPEN,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 3:
      return {
        originProfile: 'attention',
        severity: SituationSeverity.LOW,
        status: SituationStatus.IN_PROGRESS,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 4:
      return {
        originProfile: 'normal',
        severity: SituationSeverity.MEDIUM,
        status: SituationStatus.CLOSED,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 5:
      return {
        originProfile: 'high',
        severity: SituationSeverity.HIGH,
        status: SituationStatus.IN_PROGRESS,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 6:
      return {
        originProfile: 'attention',
        severity: SituationSeverity.MEDIUM,
        status: SituationStatus.IN_PROGRESS,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 7:
      return {
        originProfile: 'normal',
        severity: SituationSeverity.LOW,
        status: SituationStatus.CLOSED,
        sla: 'on_track',
        relateWithinProfile: false,
      };
    case 8:
      return {
        originProfile: 'critical',
        severity: SituationSeverity.HIGH,
        status: SituationStatus.OPEN,
        sla: 'overdue',
        relateWithinProfile: false,
      };
    default:
      return {
        originProfile: 'normal',
        severity: SituationSeverity.CRITICAL,
        status: SituationStatus.CLOSED,
        sla: 'on_track',
        relateWithinProfile: false,
      };
  }
}
