import {
  SituationSeverity,
  SituationSeverityChangeSource,
  SituationStatus,
} from '../../common/enums/situation.enums';
import {
  checkSeverityHistoryInvariants,
  severityAt,
} from '../../situations/severity-escalation/severity-history';
import {
  assertQaVivoRecordsCoherent,
  buildQaVivoRecords,
  QA_VIVO_ID_PREFIX,
  qaVivoAnchor,
  type QaVivoRecord,
} from './qa-internal-vivo.scenario';

const DAY = 86_400_000;

function historyOf(r: QaVivoRecord) {
  return [
    {
      id: 'rep',
      previousSeverity: null,
      newSeverity: r.spec.reportedSeverity,
      source: SituationSeverityChangeSource.REPORTED,
      effectiveAt: r.createdAt,
      createdAt: r.createdAt,
    },
    ...r.escalations.map((e) => ({
      id: e.id,
      previousSeverity: e.from,
      newSeverity: e.to,
      source: SituationSeverityChangeSource.AUTO_TIME,
      effectiveAt: e.effectiveAt,
      createdAt: e.recordedAt,
    })),
  ];
}

describe('Escenario QA INTERNAL vivo', () => {
  // Varias horas del día: el escenario debe ser coherente siempre que se siembre.
  const anchors = [
    '2026-10-08T12:00:00.000Z', // 07:00 Bogotá
    '2026-10-08T16:30:00.000Z', // 11:30 Bogotá
    '2026-10-08T23:30:00.000Z', // 18:30 Bogotá
  ].map((iso) => new Date(iso));

  it.each(anchors)('coherente y sin instantes futuros (ancla %s)', (anchor) => {
    const records = buildQaVivoRecords(anchor);
    expect(() => assertQaVivoRecordsCoherent(records, anchor)).not.toThrow();
  });

  it('cubre los seis escenarios pedidos', () => {
    const r = Object.fromEntries(
      buildQaVivoRecords(anchors[1]).map((x) => [x.key, x]),
    );
    expect([
      r.A.spec.reportedSeverity,
      r.A.severity,
      r.A.consequences.length,
      r.A.status,
    ]).toEqual([
      SituationSeverity.MEDIUM,
      SituationSeverity.CRITICAL,
      5,
      SituationStatus.IN_PROGRESS,
    ]);
    expect([
      r.B.spec.categoryCode,
      r.B.spec.reportedSeverity,
      r.B.severity,
      r.B.consequences.length,
      r.B.status,
    ]).toEqual([
      'APLICATIVOS',
      SituationSeverity.LOW,
      SituationSeverity.MEDIUM,
      2,
      SituationStatus.IN_PROGRESS,
    ]);
    expect([
      r.C.spec.categoryCode,
      r.C.escalations.length,
      r.C.consequences.length,
      r.C.status,
    ]).toEqual(['EQUIPOS', 0, 1, SituationStatus.CLOSED]);
    expect(
      (r.C.closedAt!.getTime() - r.C.createdAt.getTime()) / DAY,
    ).toBeLessThan(2);
    expect([
      r.D.spec.categoryCode,
      r.D.spec.reportedSeverity,
      r.D.consequences.length,
      r.D.status,
    ]).toEqual(['ACAS', SituationSeverity.LOW, 0, SituationStatus.OPEN]);
    expect([
      r.E.spec.categoryCode,
      r.E.severity,
      r.E.status,
      r.E.consequences.length > 1,
      !!r.E.spec.learning,
    ]).toEqual([
      'INFRAESTRUCTURA',
      SituationSeverity.HIGH,
      SituationStatus.CLOSED,
      true,
      true,
    ]);
    expect([
      r.F.spec.categoryCode,
      r.F.escalations.length,
      r.F.consequences.length,
    ]).toEqual(['INTERNET', 0, 1]);
    expect(anchors[1].getTime() - r.F.createdAt.getTime()).toBeLessThan(DAY);
  });

  it('G (legacy): fila REPORTED escrita días después del alta; H: en riesgo', () => {
    const r = Object.fromEntries(
      buildQaVivoRecords(anchors[1]).map((x) => [x.key, x]),
    );
    // > 5 s de diferencia → la tabla del Director lo marca no fiable.
    expect(
      r.G.reportedRecordedAt.getTime() - r.G.createdAt.getTime(),
    ).toBeGreaterThan(DAY);
    expect([r.G.escalations.length, r.G.consequences.length]).toEqual([0, 0]);
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'H']) {
      expect(r[key].reportedRecordedAt).toEqual(r[key].createdAt);
    }
    // HIGH: plazo 72 h, aviso 24 h → vence en 18 h desde la siembra.
    const dueInHours =
      (r.H.createdAt.getTime() + 3 * DAY - anchors[1].getTime()) / 3_600_000;
    expect(r.H.spec.reportedSeverity).toBe(SituationSeverity.HIGH);
    expect(dueInHours).toBe(18);
    expect(r.H.status).toBe(SituationStatus.IN_PROGRESS);
  });

  it('I/J/K: duración × afectaciones en las cuatro zonas', () => {
    const r = Object.fromEntries(
      buildQaVivoRecords(anchors[1]).map((x) => [x.key, x]),
    );
    const age = (key: string) =>
      Math.round((anchors[1].getTime() - r[key].createdAt.getTime()) / DAY);
    expect([
      age('I'),
      r.I.consequences.length,
      r.I.spec.coordinationCode,
    ]).toEqual([30, 4, 'coord-ingenierias']);
    expect([
      age('J'),
      r.J.consequences.length,
      r.J.spec.coordinationCode,
    ]).toEqual([20, 1, 'coord-ingenierias']);
    expect([
      age('K'),
      r.K.consequences.length,
      r.K.spec.coordinationCode,
    ]).toEqual([5, 3, 'coord-operaciones-academicas']);
    for (const key of ['I', 'J', 'K']) {
      expect(r[key].closedAt).toBeNull();
      expect(r[key].reportedRecordedAt).toEqual(r[key].createdAt);
    }
  });

  it('A: la historia ocurre a lo largo de días reales y cada afectación toma su severidad', () => {
    const a = buildQaVivoRecords(anchors[1]).find((x) => x.key === 'A')!;
    expect(
      (a.escalations[0].effectiveAt.getTime() - a.createdAt.getTime()) / DAY,
    ).toBe(3);
    expect(
      (a.escalations[1].effectiveAt.getTime() - a.createdAt.getTime()) / DAY,
    ).toBe(6);
    const history = historyOf(a);
    expect(
      a.consequences.map((c) => severityAt(history, c.occurredAt)),
    ).toEqual([
      SituationSeverity.MEDIUM,
      SituationSeverity.MEDIUM,
      SituationSeverity.HIGH,
      SituationSeverity.HIGH,
      SituationSeverity.CRITICAL,
    ]);
    // Una afectación registrada al día siguiente de ocurrir (demo «Registrada el…»).
    expect(
      a.consequences.some(
        (c) => c.createdAt.getTime() - c.occurredAt.getTime() > 12 * 3_600_000,
      ),
    ).toBe(true);
  });

  it('cada historial cumple los invariantes del dominio', () => {
    for (const r of buildQaVivoRecords(anchors[0])) {
      expect(
        checkSeverityHistoryInvariants({
          reportedSeverity: r.spec.reportedSeverity,
          severity: r.severity,
          closedAt: r.closedAt,
          history: historyOf(r),
        }),
      ).toEqual([]);
    }
  });

  it('ids deterministas con prefijo propio', () => {
    const one = buildQaVivoRecords(anchors[0]).map((r) => r.id);
    const two = buildQaVivoRecords(anchors[2]).map((r) => r.id);
    expect(one).toEqual(two);
    expect(one.every((id) => id.startsWith(QA_VIVO_ID_PREFIX))).toBe(true);
  });

  it('el ancla redondea a 30 minutos', () => {
    expect(
      qaVivoAnchor(new Date('2026-10-08T16:47:12.000Z')).toISOString(),
    ).toBe('2026-10-08T16:30:00.000Z');
  });
});
