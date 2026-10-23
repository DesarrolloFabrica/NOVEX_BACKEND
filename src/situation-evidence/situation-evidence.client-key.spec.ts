import { QueryFailedError } from 'typeorm';
import { SituationEvidenceService } from './situation-evidence.service';
import { EvidenceType } from '../common/enums/situation-evidence.enums';

const situationId = '5d1f7c2a-3b4e-4f5a-8b6c-7d8e9f001122';
const userId = '6f1c2b1e-8d2a-4c3b-9e4f-112233445566';

const existing = {
  id: 'ev-1',
  situationId,
  title: 'Notas adicionales',
  description: 'nota',
  type: EvidenceType.NOTE,
  clientKey: 'capture:notes',
  fileName: null,
  storagePath: null,
  mimeType: null,
  fileSize: null,
  createdAt: new Date('2026-10-22T10:00:00Z'),
  uploadedByUser: { fullName: 'Coordinador' },
};

function createService(
  overrides: {
    findOne?: jest.Mock;
    save?: jest.Mock;
    findByIdAndSituationId?: jest.Mock;
  } = {},
) {
  const evidenceRepository = {
    create: jest.fn((value: unknown) => value),
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    save:
      overrides.save ??
      jest.fn().mockResolvedValue({ ...existing, id: 'ev-new' }),
    findByIdAndSituationId:
      overrides.findByIdAndSituationId ??
      jest.fn().mockResolvedValue({ ...existing, id: 'ev-new' }),
  };
  const situationsRepository = {
    exist: jest.fn().mockResolvedValue(true),
  };
  const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
  const service = new SituationEvidenceService(
    evidenceRepository as never,
    situationsRepository as never,
    {} as never,
    timelineService as never,
  );
  return { service, evidenceRepository, timelineService };
}

const noteDto = {
  type: EvidenceType.NOTE,
  title: 'Notas adicionales',
  description: 'nota de captura',
};

describe('SituationEvidenceService con clave estable', () => {
  it('con una clave ya existente devuelve la evidencia previa sin insertar ni registrar en línea de tiempo', async () => {
    const { service, evidenceRepository, timelineService } = createService({
      findOne: jest.fn().mockResolvedValue(existing),
      findByIdAndSituationId: jest.fn().mockResolvedValue(existing),
    });

    const result = await service.create(
      situationId,
      { ...noteDto, clientKey: 'capture:notes' },
      userId,
    );

    expect(result.id).toBe('ev-1');
    expect(evidenceRepository.save).not.toHaveBeenCalled();
    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('sin clave siempre inserta, aunque exista otra evidencia con el mismo título', async () => {
    const { service, evidenceRepository } = createService({
      findOne: jest.fn().mockResolvedValue(existing),
    });

    await service.create(situationId, { ...noteDto }, userId);

    expect(evidenceRepository.save).toHaveBeenCalledTimes(1);
    expect(evidenceRepository.findOne).not.toHaveBeenCalled();
  });

  it('una carrera por inserción con la misma clave devuelve la evidencia ganadora', async () => {
    const unique = new QueryFailedError('INSERT', [], {
      code: '23505',
    } as never);
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const { service, evidenceRepository } = createService({
      findOne,
      save: jest.fn().mockRejectedValue(unique),
      findByIdAndSituationId: jest.fn().mockResolvedValue(existing),
    });

    const result = await service.create(
      situationId,
      { ...noteDto, clientKey: 'capture:notes' },
      userId,
    );

    expect(evidenceRepository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('ev-1');
  });

  it('un error ajeno a la unicidad no se oculta', async () => {
    const { service } = createService({
      save: jest.fn().mockRejectedValue(new Error('disco lleno')),
    });

    await expect(
      service.create(
        situationId,
        { ...noteDto, clientKey: 'capture:notes' },
        userId,
      ),
    ).rejects.toThrow('disco lleno');
  });
});
