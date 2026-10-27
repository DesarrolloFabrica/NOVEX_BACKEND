import { SituationsService } from './situations.service';

// Regresión de la versión de recuperación: los INTER de la release se guardan sin
// categoría (category_id NULL). La respuesta debe mostrarlos con null, nunca fallar
// ni inventar una categoría.
describe('SituationsService response mapping without category', () => {
  const build = () =>
    new SituationsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const interSituation = {
    id: 'inter-1',
    title: 'INTER sin categoría',
    description: 'Entrega pendiente',
    coordinationId: 'b2b',
    coordination: { code: 'coord-b2b', name: 'B2B' },
    createdByUserId: 'creator',
    createdByUser: { fullName: 'Analista' },
    assignedUserId: null,
    assignedUser: null,
    categoryId: null,
    category: null,
    severity: 'MEDIUM',
    status: 'OPEN',
    relatedCoordinations: [],
  };

  it('devuelve null en los campos de categoría cuando la situación no tiene categoría', () => {
    const service = build();
    const mapped = (
      service as unknown as {
        toResponse: (s: unknown) => Record<string, unknown>;
      }
    ).toResponse(interSituation);

    expect(mapped.categoryId).toBeNull();
    expect(mapped.categoryCode).toBeNull();
    expect(mapped.categoryName).toBeNull();
    expect(mapped.categoryIcon).toBeNull();
    expect(mapped.id).toBe('inter-1');
  });
});
