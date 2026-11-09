import type { EntityManager } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Fase 01B.1 · contrato de la auditoría.
 *   recordCritical  escribe con el manager de la transacción y PROPAGA el
 *                   error: la acción crítica no se confirma sin su registro.
 *   record          mejor esfuerzo: registra el fallo en el log y sigue.
 */
describe('AuditLogService · auditoría obligatoria frente a observacional', () => {
  const requestContext = { getRequestId: () => 'req-1' };
  const input = {
    actor: { sub: 'admin-1', roleCode: 'ADMIN' },
    action: 'SITUATION_CANCELLED',
    resourceType: 'situation',
    resourceId: 'sit-1',
    metadata: { previousStatus: 'OPEN', reasonLength: 24 },
  };

  it('recordCritical escribe con el manager de la transacción', async () => {
    const manager = {
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn((_entity: unknown, value: object) =>
        Promise.resolve({ ...value, id: 'audit-1' }),
      ),
    };
    const service = new AuditLogService({} as never, requestContext as never);

    await service.recordCritical(input, manager as unknown as EntityManager);

    expect(manager.save).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        action: 'SITUATION_CANCELLED',
        resourceId: 'sit-1',
        requestId: 'req-1',
      }),
    );
  });

  it('recordCritical propaga el fallo (la transacción se revierte)', async () => {
    const manager = {
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn().mockRejectedValue(new Error('audit_logs no disponible')),
    };
    const service = new AuditLogService({} as never, requestContext as never);

    await expect(
      service.recordCritical(input, manager as unknown as EntityManager),
    ).rejects.toThrow('audit_logs no disponible');
  });

  it('record absorbe el fallo (solo para eventos no críticos)', async () => {
    const repository = {
      create: jest.fn((value: object) => value),
      save: jest.fn().mockRejectedValue(new Error('caída')),
    };
    const service = new AuditLogService(
      repository as never,
      requestContext as never,
    );
    jest
      .spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(service.record(input)).resolves.toBeNull();
  });
});
