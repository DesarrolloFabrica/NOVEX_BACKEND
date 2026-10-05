import { SituationSeverity } from '../../common/enums/situation.enums';
import { CoordinationLifeSnapshot } from './coordination-life-points';
import {
  ActiveSeverityRow,
  AffectedCoordinationRow,
  IncomingDependencyRow,
} from '../repositories/operational-overview.repository';

/** Clave del grupo sin coordinación dueña: Registro de analista. */
export const ANALYST_REGISTRY_KEY = '__analyst_registry__';

export function emptyCoordinationLifeSnapshot(): CoordinationLifeSnapshot {
  return {
    activeProblemsCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    affectedCoordinationCount: 0,
    incomingDependencyCount: 0,
    incomingCriticalCount: 0,
    externalIncomingLowCount: 0,
    externalIncomingMediumCount: 0,
    externalIncomingHighCount: 0,
    externalIncomingCriticalCount: 0,
  };
}

export function snapshotKeyOf(coordinationId: string | null): string {
  return coordinationId ?? ANALYST_REGISTRY_KEY;
}

/**
 * Fusiona las agregaciones de LEVEL 0 en un snapshot por dueño.
 * Misma función para overview y KPIs: no hay fórmula paralela.
 */
export function buildCoordinationLifeSnapshots(
  severityRows: readonly ActiveSeverityRow[],
  affectedRows: readonly AffectedCoordinationRow[],
  incomingRows: readonly IncomingDependencyRow[],
): Map<string, CoordinationLifeSnapshot> {
  const snapshots = new Map<string, CoordinationLifeSnapshot>();

  const ensure = (key: string): CoordinationLifeSnapshot => {
    const existing = snapshots.get(key);
    if (existing) return existing;
    const created = emptyCoordinationLifeSnapshot();
    snapshots.set(key, created);
    return created;
  };

  for (const row of severityRows) {
    const snapshot = ensure(snapshotKeyOf(row.coordinationId));
    snapshot.activeProblemsCount += row.total;

    switch (row.severity) {
      case SituationSeverity.CRITICAL:
        snapshot.criticalCount += row.total;
        break;
      case SituationSeverity.HIGH:
        snapshot.highCount += row.total;
        break;
      case SituationSeverity.MEDIUM:
        snapshot.mediumCount += row.total;
        break;
      case SituationSeverity.LOW:
        snapshot.lowCount += row.total;
        break;
    }
  }

  for (const row of affectedRows) {
    ensure(snapshotKeyOf(row.coordinationId)).affectedCoordinationCount =
      row.total;
  }

  for (const row of incomingRows) {
    const snapshot = ensure(row.affectedCoordinationId);
    snapshot.incomingDependencyCount = row.total;
    snapshot.incomingCriticalCount = row.criticalTotal;
    snapshot.externalIncomingLowCount = row.externalLowTotal;
    snapshot.externalIncomingMediumCount = row.externalMediumTotal;
    snapshot.externalIncomingHighCount = row.externalHighTotal;
    snapshot.externalIncomingCriticalCount = row.externalCriticalTotal;
  }

  return snapshots;
}
