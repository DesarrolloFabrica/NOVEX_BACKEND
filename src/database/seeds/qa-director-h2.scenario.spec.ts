import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { CATALOG_COORDINATIONS } from '../../coordinations/seeds/coordinations.catalog.seed';
import { CATALOG_INCIDENT_CATEGORIES } from './catalogs.seed';
import {
  buildQaDirectorH2Records,
  QA_ANCHOR,
  QA_DIRECTOR_H2_SCENARIO,
  QA_ID_PREFIX,
  QA_SCOPE,
  qaMonthlyFlow,
  type QaScopeKey,
} from './qa-director-h2.scenario';
import { assertNoFuture, assertQaLocalDatabase } from './seed-qa-director-h2';

const records = buildQaDirectorH2Records();
const byScope = (scope: QaScopeKey) => records.filter((r) => r.scope === scope);
const activeSeries = (scope: QaScopeKey) =>
  qaMonthlyFlow(byScope(scope)).map((m) => m.active);
const bandOf = (age: number) =>
  age <= 7 ? 0 : age <= 14 ? 1 : age <= 30 ? 2 : 3;
const ageAtAnchor = (created: Date) =>
  Math.round(
    (Date.parse(`${QA_ANCHOR.toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(
        `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(created)}T00:00:00Z`,
      )) /
      86_400_000,
  );

describe('Escenario QA DIRECTOR H2 · alcance', () => {
  it('solo General, Operación Académica y sus cinco hijas (codes reales del catálogo)', () => {
    const codes = Object.values(QA_SCOPE)
      .map((s) => s.code)
      .sort();
    expect(codes).toEqual(
      [
        'coord-bellas-artes',
        'coord-empresarial',
        'coord-general',
        'coord-ingenierias',
        'coord-negocios',
        'coord-operaciones-academicas',
        'coord-transversales',
      ].sort(),
    );
    const catalog = new Set(CATALOG_COORDINATIONS.map((c) => c.code));
    for (const code of codes) expect(catalog.has(code)).toBe(true);
    const hijas = Object.values(QA_SCOPE).filter(
      (s) => s.parent === 'academica',
    );
    expect(hijas).toHaveLength(5);
  });

  it('INTER: responsable ≠ afectada y ambas dentro del escenario', () => {
    const inter = records.filter((r) => r.reportKind === 'INTER_COORDINATION');
    expect(inter.length).toBeGreaterThan(0);
    for (const r of inter) {
      expect(r.affectedScope).not.toBe(r.scope);
      expect(QA_SCOPE[r.affectedScope]).toBeDefined();
      expect(r.categoryCode).toBeNull();
      expect(r.affectedProcess).toBeTruthy();
      expect(r.pendingDelivery).toBeTruthy();
    }
    for (const r of records.filter((x) => x.reportKind === 'INTERNAL')) {
      expect(r.affectedScope).toBe(r.scope);
    }
  });

  it('categorías reales y seleccionables del catálogo', () => {
    const selectable = new Set(
      CATALOG_INCIDENT_CATEGORIES.filter((c) => c.isSelectable !== false).map(
        (c) => c.code,
      ),
    );
    for (const r of records.filter((x) => x.reportKind === 'INTERNAL')) {
      expect(r.categoryCode).not.toBeNull();
      expect(selectable.has(r.categoryCode!)).toBe(true);
    }
  });
});

describe('Escenario QA DIRECTOR H2 · determinismo e invariantes', () => {
  it('determinista: dos construcciones idénticas; ids únicos con prefijo QA', () => {
    expect(buildQaDirectorH2Records()).toEqual(records);
    const ids = records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith(QA_ID_PREFIX)).toBe(true);
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('ventana 1 jul – 7 oct 2026: nada en nov/dic ni después del ancla', () => {
    const min = Date.parse('2026-07-01T00:00:00-05:00');
    for (const r of records) {
      for (const d of [r.createdAt, r.closedAt, r.inProgressAt, r.occurredAt]) {
        if (!d) continue;
        expect(d.getTime()).toBeGreaterThanOrEqual(min - 24 * 3_600_000);
        expect(d.getTime()).toBeLessThanOrEqual(QA_ANCHOR.getTime());
      }
    }
    expect(() => assertNoFuture(records, QA_ANCHOR)).not.toThrow();
    expect(() =>
      assertNoFuture(records, new Date('2026-10-06T12:00:00-05:00')),
    ).toThrow(/futuros/);
  });

  it('sin datos imposibles: cierres coherentes, estados coherentes, ocurrencia ≤ registro', () => {
    for (const r of records) {
      expect(r.occurredAt.getTime()).toBeLessThanOrEqual(r.createdAt.getTime());
      if (r.status === SituationStatus.CLOSED) {
        expect(r.closedAt).not.toBeNull();
        expect(r.closedAt!.getTime()).toBeGreaterThan(r.createdAt.getTime());
        expect(r.learning?.trim()).toBeTruthy();
        expect(r.inProgressAt!.getTime()).toBeLessThan(r.closedAt!.getTime());
      } else {
        expect(r.closedAt).toBeNull();
        expect([SituationStatus.OPEN, SituationStatus.IN_PROGRESS]).toContain(
          r.status,
        );
      }
      if (r.status === SituationStatus.IN_PROGRESS)
        expect(r.inProgressAt).not.toBeNull();
      if (r.status === SituationStatus.OPEN) expect(r.inProgressAt).toBeNull();
    }
    expect(records.some((r) => r.status === SituationStatus.RESOLVED)).toBe(
      false,
    );
  });

  it('volumen razonable: 80–150 en total', () => {
    expect(records.length).toBeGreaterThanOrEqual(80);
    expect(records.length).toBeLessThanOrEqual(150);
  });
});

describe('Escenario QA DIRECTOR H2 · personalidad de cada coordinación', () => {
  it('stock = stock anterior + creados − cerrados (mes a mes)', () => {
    for (const coordination of QA_DIRECTOR_H2_SCENARIO) {
      const flow = qaMonthlyFlow(byScope(coordination.scope));
      let previous = 0;
      for (const month of flow) {
        expect(month.active).toBe(previous + month.created - month.closed);
        previous = month.active;
      }
    }
  });

  it('General: sube → pico en AGO → baja en SEP → repunte en OCT', () => {
    const [jul, ago, sep, oct] = activeSeries('general');
    expect(ago).toBeGreaterThan(jul);
    expect(sep).toBeLessThan(ago);
    expect(oct).toBeGreaterThan(sep);
    const flow = qaMonthlyFlow(byScope('general'));
    expect(flow[2].closed).toBeGreaterThan(flow[2].created);
  });

  it('Operación Académica: crece, crece fuerte (SEP) y empieza a recuperarse (OCT)', () => {
    const [jul, ago, sep, oct] = activeSeries('academica');
    expect(ago).toBeGreaterThan(jul);
    expect(sep - ago).toBeGreaterThan(ago - jul);
    expect(oct).toBeLessThan(sep);
  });

  it('Bellas Artes (A) mejora · Ingenierías (B) empeora · Transversales (C) estable · Empresarial termina en 0', () => {
    const ba = activeSeries('bellasArtes');
    expect(ba[3]).toBeLessThan(ba[2]);
    expect(ba[2]).toBeLessThan(ba[1]);
    const ing = activeSeries('ingenierias');
    for (let i = 1; i < ing.length; i += 1)
      expect(ing[i]).toBeGreaterThan(ing[i - 1]);
    const trv = activeSeries('transversales');
    expect(Math.max(...trv) - Math.min(...trv)).toBeLessThanOrEqual(1);
    expect(activeSeries('empresarial')[3]).toBe(0);
  });

  it('series no planas: General y Operación Académica distintas entre sí', () => {
    const general = qaMonthlyFlow(byScope('general')).map((m) => m.created);
    const academica = qaMonthlyFlow(byScope('academica')).map((m) => m.created);
    expect(new Set(general).size).toBeGreaterThan(2);
    expect(general).not.toEqual(academica);
  });

  it('arrastrados: julio→abierto, julio→septiembre y agosto→octubre', () => {
    const month = (d: Date | null) => (d ? d.toISOString().slice(5, 7) : null);
    const carried = records.map((r) => [month(r.createdAt), month(r.closedAt)]);
    expect(carried).toContainEqual(['07', null]);
    expect(carried).toContainEqual(['07', '09']);
    expect(carried).toContainEqual(['08', '10']);
  });

  it('Resolución: duraciones exactas de los casos frontera (no días calendario)', () => {
    const hours = (key: string) => {
      const r = records.find((x) => x.key === key)!;
      return (r.closedAt!.getTime() - r.createdAt.getTime()) / 3_600_000;
    };
    expect(hours('GR1')).toBe(0.5);
    // Mismo día: > 0, no «0 días».
    expect(hours('GR2')).toBe(4);
    // Cruza medianoche Bogotá: 1 hora, no «1 día».
    expect(hours('GR3')).toBe(1);
    expect(hours('GR4')).toBe(48);
    expect(hours('OR1')).toBe(18);
    expect(hours('OR2')).toBe(36);
    // Cierre EXACTO al inicio de octubre (Bogotá): pertenece a OCT.
    const edge = records.find((x) => x.key === 'GR5')!;
    expect(edge.closedAt!.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(edge.createdAt.toISOString().slice(5, 7)).toBe('09');
  });

  it('Resolución: General, Operación Académica e Ingenierías pueblan los seis rangos', () => {
    const BOUNDS = [24, 72, 168, 336, 720];
    const band = (h: number) => BOUNDS.filter((b) => h >= b).length;
    const all = new Set<number>();
    for (const scope of ['general', 'academica', 'ingenierias'] as const) {
      for (const r of byScope(scope)) {
        if (r.closedAt) {
          all.add(
            band((r.closedAt.getTime() - r.createdAt.getTime()) / 3_600_000),
          );
        }
      }
    }
    expect([...all].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    // General y Operación Académica, cada una, tienen cierres de < 1 día y de 30+ días.
    for (const scope of ['general', 'academica'] as const) {
      const bands = byScope(scope)
        .filter((r) => r.closedAt)
        .map((r) =>
          band((r.closedAt!.getTime() - r.createdAt.getTime()) / 3_600_000),
        );
      expect(bands).toContain(0);
      expect(bands).toContain(5);
    }
  });

  it('Antigüedad: General y Operación Académica pueblan los cuatro rangos; OA tiene ≥ 7 activos', () => {
    for (const scope of ['general', 'academica'] as const) {
      const bands = new Set(
        byScope(scope)
          .filter((r) => r.closedAt === null)
          .map((r) => bandOf(ageAtAnchor(r.createdAt))),
      );
      expect([...bands].sort()).toEqual([0, 1, 2, 3]);
    }
    const oa = byScope('academica').filter((r) => r.closedAt === null);
    expect(oa.length).toBeGreaterThanOrEqual(7);
    expect(
      new Set(oa.map((r) => ageAtAnchor(r.createdAt))).size,
    ).toBeGreaterThanOrEqual(7);
  });

  it('semana 5–11 OCT de Operación Académica: días irregulares', () => {
    const oa = byScope('academica');
    const day = (d: Date | null) =>
      d
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
          }).format(d)
        : null;
    const series = ['2026-10-05', '2026-10-06', '2026-10-07'].map((ymd) => [
      oa.filter((r) => day(r.createdAt) === ymd).length,
      oa.filter((r) => day(r.closedAt) === ymd).length,
    ]);
    expect(new Set(series.map((pair) => pair.join('/'))).size).toBe(3);
  });

  it('severidad no uniforme: CRITICAL escaso, LOW/MEDIUM frecuentes', () => {
    const count = (sev: SituationSeverity) =>
      records.filter((r) => r.severity === sev).length;
    expect(count(SituationSeverity.CRITICAL)).toBeLessThan(
      count(SituationSeverity.HIGH),
    );
    expect(count(SituationSeverity.HIGH)).toBeLessThan(
      count(SituationSeverity.MEDIUM),
    );
    expect(count(SituationSeverity.CRITICAL)).toBeGreaterThan(0);
  });
});

describe('seed QA DIRECTOR H2 · protección local', () => {
  const base = {
    DB_CLOUD: 'false',
    DB_HOST_LOCAL: 'localhost',
    DB_PORT_LOCAL: '5442',
    DB_USERNAME_LOCAL: 'novex',
    DB_PASSWORD_LOCAL: 'novex',
    DB_DATABASE_LOCAL: 'novex',
    DB_SSL_LOCAL: 'false',
  };

  it('acepta la Postgres local', () => {
    expect(assertQaLocalDatabase(base as NodeJS.ProcessEnv)).toEqual({
      host: 'localhost',
      database: 'novex',
    });
  });

  it('rechaza Cloud SQL aunque exista ALLOW_CLOUD_SEED', () => {
    expect(() =>
      assertQaLocalDatabase({
        ...base,
        DB_CLOUD: 'true',
        ALLOW_CLOUD_SEED: 'true',
        DB_HOST_CLOUD: '34.31.17.63',
        DB_USERNAME_CLOUD: 'novex',
        DB_PASSWORD_CLOUD: 'x',
        DB_DATABASE_CLOUD: 'novex',
      }),
    ).toThrow(/LOCAL/);
  });

  it('rechaza host remoto, SSL o NODE_ENV=production', () => {
    expect(() =>
      assertQaLocalDatabase({
        ...base,
        DB_HOST_LOCAL: '10.0.0.5',
      }),
    ).toThrow(/host no local/);
    expect(() =>
      assertQaLocalDatabase({
        ...base,
        DB_SSL_LOCAL: 'true',
      }),
    ).toThrow(/SSL/);
    expect(() =>
      assertQaLocalDatabase({
        ...base,
        NODE_ENV: 'production',
      }),
    ).toThrow(/production/);
  });
});
