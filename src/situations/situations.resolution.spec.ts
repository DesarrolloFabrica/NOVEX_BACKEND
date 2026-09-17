import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationSeverity, SituationStatus } from '../common/enums/situation.enums';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { Situation } from './entities/situation.entity';
import { SituationResolution } from './entities/situation-resolution.entity';
import { SituationsService } from './situations.service';

/**
 * RESOLUCIÓN CON APRENDIZAJE.
 *
 * La política de autorización se ejercita con el `OperationalScopeService`
 * REAL, no con un doble: es la regla que estas pruebas existen para verificar y
 * un mock la daría por buena sin comprobarla.
 *
 * La transacción se simula EN MEMORIA: `transaction()` toma una instantánea,
 * ejecuta el cuerpo y la restaura si algo lanza. Eso permite comprobar la
 * atomicidad observable —que un fallo no deja ni el estado cambiado ni el
 * aprendizaje escrito— y que dos resoluciones seguidas no se pisan.
 *
 * LO QUE ESTA SIMULACIÓN NO DEMUESTRA, y queda pendiente de una base de pruebas
 * real: que `pessimistic_write` serialice de verdad dos peticiones SIMULTÁNEAS
 * en PostgreSQL, y que la clave primaria de `situation_resolutions` rechace la
 * segunda inserción. Aquí se comprueba el comportamiento del servicio ANTE esos
 * dos escenarios, no el motor que los produce.
 */
describe('SituationsService · resolver con aprendizaje', () => {
  const AREA_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const AREA_B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const SIT_ID = 'ssssssss-0000-4000-8000-000000000009';

  const actor = (over: Partial<AuthPayload>): AuthPayload => ({
    sub: 'user-coord-a',
    email: 'coord.a@cun.edu.co',
    roleId: 'role-coord',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_CLOSE'],
    status: UserStatus.ACTIVE,
    ...over,
  });

  const coordinadorA = actor({});

  function buildSituation(over: Partial<Situation> = {}): Situation {
    return {
      id: SIT_ID,
      title: 'Caída del portal',
      description: 'Descripción',
      coordinationId: AREA_A,
      coordination: { id: AREA_A, code: 'coord-a', name: 'Área A' },
      createdByUserId: 'autor-distinto',
      createdByUser: { fullName: 'Autor Distinto' },
      assignedUserId: null,
      assignedUser: null,
      categoryId: 'cat-1',
      category: { code: 'TECH', name: 'Técnica', icon: 'x' },
      severity: SituationSeverity.HIGH,
      status: SituationStatus.OPEN,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      dueAt: null,
      slaPolicyCode: null,
      slaBreachedAt: null,
      lastSlaReminderAt: null,
      occurredAt: new Date('2026-09-01T10:00:00.000Z'),
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      relatedCoordinations: [],
      resolution: null,
      ...over,
    } as unknown as Situation;
  }

  /**
   * Doble de base de datos con semántica transaccional suficiente para el caso:
   * instantánea al entrar, restauración si el cuerpo lanza.
   */
  function createHarness(seed: Situation = buildSituation()) {
    const db = {
      situation: seed,
      resolution: null as SituationResolution | null,
      timeline: [] as unknown[],
    };

    /** Forzable para simular la violación de clave primaria. */
    let insertFails = false;

    const manager = {
      findOne: jest.fn((entity: unknown) => {
        if (entity !== Situation) throw new Error('entidad inesperada');
        return Promise.resolve(db.situation ? { ...db.situation } : null);
      }),
      save: jest.fn((entity: unknown, value: Situation) => {
        if (entity !== Situation) throw new Error('entidad inesperada');
        db.situation = { ...value };
        return Promise.resolve(db.situation);
      }),
      insert: jest.fn((entity: unknown, value: SituationResolution) => {
        if (entity !== SituationResolution) throw new Error('entidad inesperada');
        if (insertFails || db.resolution) {
          return Promise.reject(
            new QueryFailedError('insert', [], new Error('duplicate key')),
          );
        }
        db.resolution = { ...value, createdAt: new Date() };
        return Promise.resolve({ identifiers: [] });
      }),
    };

    const situationsRepository = {
      manager: {
        transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => {
          const snapshot = {
            situation: db.situation ? { ...db.situation } : null,
            resolution: db.resolution ? { ...db.resolution } : null,
            timeline: [...db.timeline],
          };
          try {
            return await cb(manager);
          } catch (error) {
            // ROLLBACK: nada de lo escrito dentro sobrevive.
            db.situation = snapshot.situation as Situation;
            db.resolution = snapshot.resolution;
            db.timeline = snapshot.timeline;
            throw error;
          }
        }),
      },
      findByIdWithRelations: jest.fn(() =>
        Promise.resolve(
          db.situation
            ? { ...db.situation, resolution: db.resolution }
            : null,
        ),
      ),
    };

    const timelineService = {
      createEntry: jest.fn((entry: unknown) => {
        db.timeline.push(entry);
        return Promise.resolve({});
      }),
    };
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };

    const service = new SituationsService(
      situationsRepository as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { create: jest.fn() } as never,
      { create: jest.fn() } as never,
      timelineService as never,
      // POLÍTICA REAL.
      new OperationalScopeService() as never,
      auditLogService as never,
    );

    return {
      service,
      db,
      timelineService,
      auditLogService,
      failNextInsert: () => {
        insertFails = true;
      },
    };
  }

  describe('camino feliz', () => {
    it('cierra y guarda el aprendizaje en una sola operación desde OPEN', async () => {
      const h = createHarness();

      const response = await h.service.resolve(
        SIT_ID,
        { learning: '  Faltó un plan de reversión.  ' },
        coordinadorA,
      );

      expect(h.db.situation.status).toBe(SituationStatus.CLOSED);
      expect(h.db.situation.closedAt).toBeInstanceOf(Date);
      expect(h.db.situation.resolvedAt).toBeInstanceOf(Date);
      // Recortado antes de persistirse.
      expect(h.db.resolution?.learning).toBe('Faltó un plan de reversión.');
      expect(h.db.resolution?.resolvedByUserId).toBe('user-coord-a');
      expect(response.status).toBe(SituationStatus.CLOSED);
    });

    it('también resuelve desde IN_PROGRESS, sin una segunda petición', async () => {
      const h = createHarness(
        buildSituation({ status: SituationStatus.IN_PROGRESS }),
      );
      await h.service.resolve(SIT_ID, { learning: 'Aprendizaje' }, coordinadorA);
      expect(h.db.situation.status).toBe(SituationStatus.CLOSED);
      // Una sola transacción para todo el cierre.
      expect(h.db.timeline).toHaveLength(1);
    });

    it('NO simula «En atención» ni asigna un responsable artificial', async () => {
      const h = createHarness();
      await h.service.resolve(SIT_ID, { learning: 'Aprendizaje' }, coordinadorA);

      expect(h.db.situation.assignedUserId).toBeNull();
      // Un único evento: el cierre. No hay un paso intermedio inventado.
      expect(h.db.timeline).toHaveLength(1);
    });

    it('el aprendizaje NO se copia a lastStatusComment', async () => {
      // Comentario de transición y aprendizaje son cosas distintas: el primero
      // se sobrescribe en cada cambio de estado, el segundo es definitivo.
      const h = createHarness(
        buildSituation({
          status: SituationStatus.IN_PROGRESS,
          lastStatusComment: 'Se pasó a atención el lunes',
        }),
      );
      await h.service.resolve(
        SIT_ID,
        { learning: 'Documentar el rollback' },
        coordinadorA,
      );

      expect(h.db.situation.lastStatusComment).toBeNull();
      expect(h.db.resolution?.learning).toBe('Documentar el rollback');
    });

    it('registra auditoría sin volcar el texto del aprendizaje', async () => {
      const h = createHarness();
      await h.service.resolve(SIT_ID, { learning: 'Secreto' }, coordinadorA);

      const metadata = h.auditLogService.record.mock.calls[0][0].metadata;
      expect(metadata.learningLength).toBe('Secreto'.length);
      expect(JSON.stringify(metadata)).not.toContain('Secreto');
    });
  });

  describe('autorización aplicada en backend', () => {
    const rechazados: Array<[string, AuthPayload]> = [
      [
        'ADMIN, aunque tenga el permiso',
        actor({ roleCode: 'ADMIN', sub: 'admin-1' }),
      ],
      [
        'DIRECTOR, aunque tenga el permiso',
        actor({ roleCode: 'DIRECTOR', sub: 'dir-1' }),
      ],
      [
        'ANALISTA, aunque tenga el permiso',
        actor({ roleCode: 'ANALISTA', sub: 'ana-1' }),
      ],
      [
        'COORDINADOR de otra área',
        actor({ coordinationId: AREA_B, sub: 'coord-b' }),
      ],
      [
        'AUTOR del reporte que coordina otra área',
        actor({ coordinationId: AREA_B, sub: 'autor-distinto' }),
      ],
    ];

    it.each(rechazados)('rechaza a %s y no escribe nada', async (_l, who) => {
      const h = createHarness();

      await expect(
        h.service.resolve(SIT_ID, { learning: 'Intento' }, who),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(h.db.situation.status).toBe(SituationStatus.OPEN);
      expect(h.db.resolution).toBeNull();
      expect(h.db.timeline).toHaveLength(0);
    });

    it('rechaza a quien coordina un área solo RELACIONADA con el problema', async () => {
      const h = createHarness(
        buildSituation({
          relatedCoordinations: [
            { coordinationId: AREA_B, displayOrder: 0 },
          ] as never,
        }),
      );

      await expect(
        h.service.resolve(
          SIT_ID,
          { learning: 'Intento' },
          actor({ coordinationId: AREA_B, sub: 'coord-b' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.db.resolution).toBeNull();
    });

    it('no existe la situación: 404 antes de cualquier escritura', async () => {
      const h = createHarness();
      h.db.situation = null as never;

      await expect(
        h.service.resolve(SIT_ID, { learning: 'x' }, coordinadorA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(h.db.resolution).toBeNull();
    });
  });

  describe('aprendizaje obligatorio', () => {
    it.each([['vacío', ''], ['solo espacios', '   \n\t  ']])(
      'rechaza un aprendizaje %s',
      async (_l, learning) => {
        const h = createHarness();
        await expect(
          h.service.resolve(SIT_ID, { learning }, coordinadorA),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(h.db.situation.status).toBe(SituationStatus.OPEN);
      },
    );
  });

  describe('atomicidad y concurrencia', () => {
    it('si falla el aprendizaje, el cierre NO queda guardado', async () => {
      const h = createHarness();
      h.failNextInsert();

      await expect(
        h.service.resolve(SIT_ID, { learning: 'Aprendizaje' }, coordinadorA),
      ).rejects.toBeInstanceOf(ConflictException);

      // Rollback: el problema sigue abierto y sin evento de cierre.
      expect(h.db.situation.status).toBe(SituationStatus.OPEN);
      expect(h.db.situation.closedAt).toBeNull();
      expect(h.db.resolution).toBeNull();
      expect(h.db.timeline).toHaveLength(0);
    });

    it('una segunda resolución no sobrescribe aprendizaje ni autoría', async () => {
      const h = createHarness();

      await h.service.resolve(
        SIT_ID,
        { learning: 'Primer aprendizaje' },
        coordinadorA,
      );

      const otroCoordinadorDeA = actor({ sub: 'otro-coord-a' });
      await expect(
        h.service.resolve(
          SIT_ID,
          { learning: 'Segundo aprendizaje' },
          otroCoordinadorDeA,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(h.db.resolution?.learning).toBe('Primer aprendizaje');
      expect(h.db.resolution?.resolvedByUserId).toBe('user-coord-a');
      // El evento de cierre se emitió UNA sola vez.
      expect(h.db.timeline).toHaveLength(1);
    });

    it('un problema ya CERRADO no admite nueva resolución', async () => {
      const h = createHarness(
        buildSituation({
          status: SituationStatus.CLOSED,
          closedAt: new Date('2026-09-10T00:00:00.000Z'),
        }),
      );

      await expect(
        h.service.resolve(SIT_ID, { learning: 'Tarde' }, coordinadorA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.db.resolution).toBeNull();
    });
  });

  describe('compatibilidad histórica', () => {
    it('una situación cerrada SIN aprendizaje sigue siendo legible', async () => {
      const h = createHarness(
        buildSituation({
          status: SituationStatus.CLOSED,
          closedAt: new Date('2026-08-01T00:00:00.000Z'),
          resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
          lastStatusComment: 'Cierre antiguo por motivo de transición',
        }),
      );

      const response = await h.service.getById(SIT_ID, coordinadorA);

      expect(response.status).toBe(SituationStatus.CLOSED);
      // Ausencia legítima: no se inventa aprendizaje.
      expect(response.resolution).toBeNull();
      expect(response.lastStatusComment).toBe(
        'Cierre antiguo por motivo de transición',
      );
      // Ya cerrada: la interfaz no debe ofrecer resolverla.
      expect(response.canResolve).toBe(false);
    });

    it('un problema RESOLVED legado todavía puede cerrarse', async () => {
      const h = createHarness(
        buildSituation({
          status: SituationStatus.RESOLVED,
          resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      );

      await h.service.resolve(SIT_ID, { learning: 'Cierre tardío' }, coordinadorA);

      expect(h.db.situation.status).toBe(SituationStatus.CLOSED);
      // No se pisa la fecha de resolución histórica.
      expect(h.db.situation.resolvedAt).toEqual(
        new Date('2026-08-01T00:00:00.000Z'),
      );
    });
  });

  describe('canResolve en la respuesta', () => {
    it('es true para el coordinador responsable y false para los demás', async () => {
      const h = createHarness();

      const paraResponsable = await h.service.getById(SIT_ID, coordinadorA);
      expect(paraResponsable.canResolve).toBe(true);

      const director = actor({
        roleCode: 'DIRECTOR',
        coordinationId: null,
        permissions: ['SITUATIONS_VIEW', 'SITUATIONS_CLOSE'],
      });
      const paraDirector = await h.service.getById(SIT_ID, director);
      expect(paraDirector.canResolve).toBe(false);
    });
  });
});
