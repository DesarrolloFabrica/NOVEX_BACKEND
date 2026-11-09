import { IsNull } from 'typeorm';
import { SituationContextBuilder } from '../ai-prompt-engine/builders/situation-context.builder';
import { SituationEvidenceRepository } from './repositories/situation-evidence.repository';

/**
 * FASE 01B.2 · Una evidencia retirada no aparece como activa ni llega al
 * contexto de Gemini: el listado por defecto filtra `retired_at IS NULL`, y el
 * constructor del contexto usa ese listado por defecto.
 */
describe('Fase 01B.2 · evidencias activas por defecto', () => {
  function repositoryWithFind() {
    const repository = Object.create(
      SituationEvidenceRepository.prototype,
    ) as SituationEvidenceRepository;
    const find = jest.fn().mockResolvedValue([]);
    Object.assign(repository, { find });
    return { repository, find };
  }

  it('el listado por defecto excluye las retiradas', async () => {
    const { repository, find } = repositoryWithFind();
    await repository.findBySituationId('situation-1');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { situationId: 'situation-1', retiredAt: IsNull() },
      }),
    );
  });

  it('includeRetired devuelve el historial completo', async () => {
    const { repository, find } = repositoryWithFind();
    await repository.findBySituationId('situation-1', { includeRetired: true });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { situationId: 'situation-1' } }),
    );
  });

  it('el contexto de Gemini pide solo evidencias activas', async () => {
    const findBySituationId = jest.fn().mockResolvedValue([]);
    const builder = new SituationContextBuilder(
      {} as never,
      {} as never,
      { findBySituationId } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await builder.buildEvidence('situation-1');

    expect(findBySituationId).toHaveBeenCalledWith('situation-1');
    expect(findBySituationId.mock.calls[0]).toHaveLength(1);
  });
});
