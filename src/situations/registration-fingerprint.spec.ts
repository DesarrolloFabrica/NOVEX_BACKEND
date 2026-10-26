import type { CreateSituationDto } from './dto/situation.dto';
import { computeRegistrationFingerprint } from './registration-fingerprint';
import {
  SituationReportKind,
  SituationSeverity,
} from '../common/enums/situation.enums';

const baseDto: CreateSituationDto = {
  title: 'Caída de red',
  description: 'Sin conexión en piso 3',
  reportKind: SituationReportKind.INTERNAL,
  coordinationId: '11111111-1111-4111-8111-111111111111',
  categoryId: '22222222-2222-4222-8222-222222222222',
  severity: SituationSeverity.MEDIUM,
  occurredAt: '2026-10-22',
  relatedCoordinationIds: [
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ],
};

describe('computeRegistrationFingerprint', () => {
  it('es determinista para el mismo contenido', () => {
    expect(computeRegistrationFingerprint(baseDto)).toBe(
      computeRegistrationFingerprint({ ...baseDto }),
    );
  });

  it('ignora espacios laterales en título y descripción', () => {
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        title: `  ${baseDto.title}  `,
        description: ` ${baseDto.description}\n`,
      }),
    ).toBe(computeRegistrationFingerprint(baseDto));
  });

  it('no depende del orden de las coordinaciones relacionadas', () => {
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        relatedCoordinationIds: [
          ...(baseDto.relatedCoordinationIds ?? []),
        ].reverse(),
      }),
    ).toBe(computeRegistrationFingerprint(baseDto));
  });

  it('cambia cuando cambia cualquier campo de negocio', () => {
    const original = computeRegistrationFingerprint(baseDto);

    expect(
      computeRegistrationFingerprint({ ...baseDto, title: 'Otro título' }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        severity: SituationSeverity.CRITICAL,
      }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({ ...baseDto, occurredAt: '2026-10-21' }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        relatedCoordinationIds: [],
      }),
    ).not.toBe(original);
  });
});
