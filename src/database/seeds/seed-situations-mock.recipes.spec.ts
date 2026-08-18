import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import {
  recipeForMockIndex,
  resolveIslandMockProfile,
} from './seed-situations-mock.recipes';

describe('seed-situations-mock.recipes', () => {
  it('reserva criticidad a Fábrica y Operaciones Académicas', () => {
    expect(resolveIslandMockProfile('coord-fabrica-contenidos')).toBe(
      'critical',
    );
    expect(resolveIslandMockProfile('coord-operaciones-academicas')).toBe(
      'critical',
    );
    expect(resolveIslandMockProfile('coord-homologaciones')).toBe('high');
    expect(resolveIslandMockProfile('coord-servicios')).toBe('attention');
    expect(resolveIslandMockProfile('coord-empresarial')).toBe('normal');
  });

  it('no deja situaciones vigentes que pinten islas normales de rojo', () => {
    const recipes = Array.from({ length: 80 }, (_, index) =>
      recipeForMockIndex(index),
    );
    const active = recipes.filter(
      (recipe) => recipe.status !== SituationStatus.CLOSED,
    );

    expect(active.every((recipe) => recipe.originProfile !== 'normal')).toBe(
      true,
    );
    expect(
      active
        .filter((recipe) => recipe.severity === SituationSeverity.CRITICAL)
        .every((recipe) => recipe.originProfile === 'critical'),
    ).toBe(true);
    expect(
      active
        .filter((recipe) => recipe.sla === 'overdue')
        .every((recipe) => recipe.originProfile === 'critical'),
    ).toBe(true);
  });

  it('mezcla perfiles en cada ciclo de diez casos', () => {
    const cycle = Array.from(
      { length: 10 },
      (_, index) => recipeForMockIndex(index).originProfile,
    );

    expect(cycle.filter((profile) => profile === 'critical')).toHaveLength(2);
    expect(cycle.filter((profile) => profile === 'high')).toHaveLength(2);
    expect(cycle.filter((profile) => profile === 'attention')).toHaveLength(3);
    expect(cycle.filter((profile) => profile === 'normal')).toHaveLength(3);
  });
});
