/**
 * Piezas de prueba compartidas por los specs de SituationsService.
 *
 * El alta, la resolución y las afectaciones corren dentro de
 * `situationsRepository.manager.transaction(cb)`. Estos mocks ejecutan `cb`
 * con un `manager` falso que registra lo escrito, y permiten forzar un fallo
 * en mitad de la transacción para comprobar el ROLLBACK lógico (el error se
 * propaga y no se audita nada después).
 */

export interface ManagerMockOptions {
  /** Fila que devuelve `findOne` (p. ej. la situación bloqueada). */
  findOneResult?: unknown;
  /** Si se define, `save` lanza este error cuando la entidad es de ese tipo. */
  failSaveOf?: { entity: unknown; error: Error };
}

/** Lo que devuelve `save`: lo guardado más un `id` (el dado o uno generado). */
type SavedRow = { id: string; [key: string]: unknown };

export function createManagerMock(options: ManagerMockOptions = {}) {
  let sequence = 0;
  const manager = {
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
      ...data,
    })),
    save: jest.fn(
      (entity: unknown, data: Record<string, unknown>): Promise<SavedRow> => {
        if (options.failSaveOf && entity === options.failSaveOf.entity) {
          return Promise.reject(options.failSaveOf.error);
        }
        sequence += 1;
        return Promise.resolve({
          ...data,
          id: (data.id as string | undefined) ?? `generated-${sequence}`,
        });
      },
    ),
    insert: jest.fn().mockResolvedValue({ identifiers: [] }),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(options.findOneResult ?? null),
    query: jest.fn().mockResolvedValue([]),
  };
  return manager;
}

export type ManagerMock = ReturnType<typeof createManagerMock>;

/** `manager.transaction(cb)` que ejecuta `cb(manager)` y propaga sus errores. */
export function transactionalManager(manager: ManagerMock) {
  return {
    ...manager,
    transaction: jest.fn(
      async <T>(cb: (m: ManagerMock) => Promise<T>): Promise<T> => cb(manager),
    ),
  };
}

/** Repositorios del detalle sin datos: historial y afectaciones vacíos. */
export function emptyDetailRepositories() {
  return {
    severityChangesRepository: { find: jest.fn().mockResolvedValue([]) },
    consequencesRepository: { find: jest.fn().mockResolvedValue([]) },
  };
}

/** Motor de escalamiento sin política (el estado productivo actual). */
export function inertEscalationService() {
  return {
    materializeDueEscalations: jest.fn().mockResolvedValue([]),
    recordAudit: jest.fn().mockResolvedValue(undefined),
  };
}
