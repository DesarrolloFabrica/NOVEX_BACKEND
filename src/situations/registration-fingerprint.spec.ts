import { createHash } from 'node:crypto';
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

describe('computeRegistrationFingerprint con el contrato de cartas', () => {
  const interDto: CreateSituationDto = {
    title: 'Guiones pendientes',
    description: 'Retraso de entrega',
    reportKind: SituationReportKind.INTER_COORDINATION,
    coordinationId: '11111111-1111-4111-8111-111111111111',
    affectedCoordinationId: '55555555-5555-4555-8555-555555555555',
    severity: SituationSeverity.HIGH,
    occurredAt: '2026-10-22T13:30:00.000Z',
    affectedProcess: 'Certificación',
    pendingDelivery: 'Guiones del módulo 3',
  };

  it('cambia cuando cambia un campo propio de cartas', () => {
    const original = computeRegistrationFingerprint(interDto);

    expect(
      computeRegistrationFingerprint({
        ...interDto,
        affectedCoordinationId: '66666666-6666-4666-8666-666666666666',
      }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({ ...interDto, affectedProcess: 'Otro' }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({ ...interDto, pendingDelivery: 'Otra' }),
    ).not.toBe(original);
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        initialConsequence: { description: 'Se retrasó la entrega' },
      }),
    ).not.toBe(computeRegistrationFingerprint(baseDto));
    expect(
      computeRegistrationFingerprint({
        ...baseDto,
        reportKind: SituationReportKind.INTER_COORDINATION,
      }),
    ).not.toBe(computeRegistrationFingerprint(baseDto));
  });

  it('ignora espacios laterales en los textos de cartas', () => {
    expect(
      computeRegistrationFingerprint({
        ...interDto,
        affectedProcess: '  Certificación ',
        pendingDelivery: 'Guiones del módulo 3\n',
      }),
    ).toBe(computeRegistrationFingerprint(interDto));
  });

  it('una petición del contrato anterior conserva exactamente la huella de main', () => {
    // Algoritmo de main (49a6483), copiado literalmente como referencia.
    const mainFingerprint = (dto: CreateSituationDto): string =>
      createHash('sha256')
        .update(
          JSON.stringify({
            title: dto.title.trim(),
            description: dto.description.trim(),
            coordinationId: dto.coordinationId ?? null,
            categoryId: dto.categoryId,
            severity: dto.severity,
            occurredAt: dto.occurredAt,
            relatedCoordinationIds: [
              ...new Set(
                (dto.relatedCoordinationIds ?? []).map((id) => id.trim()),
              ),
            ]
              .filter((id) => id.length > 0)
              .sort(),
          }),
        )
        .digest('hex');

    // Lo que envía el frontend publicado: sin reportKind ni campos de cartas.
    const { reportKind: _omitido, ...legacy } = baseDto;
    void _omitido;
    const legacyDto = legacy as CreateSituationDto;

    expect(computeRegistrationFingerprint(legacyDto)).toBe(
      mainFingerprint(legacyDto),
    );
  });
});
