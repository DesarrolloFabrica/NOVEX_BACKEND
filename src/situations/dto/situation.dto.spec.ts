import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateSituationConsequenceDto,
  CreateSituationDto,
  UpdateSituationDto,
} from './situation.dto';

/** Las mismas opciones que el ValidationPipe global (main.ts). */
async function errorsOf<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(cls, plain, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const flatten = (list: typeof errors): string[] =>
    list.flatMap((e) => [e.property, ...flatten(e.children ?? [])]);
  return flatten(errors);
}

describe('DTOs de situación · contrato INTERNAL vivo', () => {
  const internal = {
    title: 'Internet',
    description: 'Intermitente',
    reportKind: 'INTERNAL',
    coordinationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    categoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    severity: 'MEDIUM',
    occurredAt: '2026-10-07T10:00:00.000Z',
  };

  describe('UpdateSituationDto (PATCH)', () => {
    it.each(['severity', 'categoryId', 'reportedSeverity'])(
      '"%s" ya no es editable: se rechaza',
      async (field) => {
        expect(
          await errorsOf(UpdateSituationDto, { [field]: 'HIGH' }),
        ).toContain(field);
      },
    );

    it('los campos que siguen editables pasan', async () => {
      expect(
        await errorsOf(UpdateSituationDto, {
          title: 'Nuevo título',
          status: 'IN_PROGRESS',
        }),
      ).toEqual([]);
    });
  });

  describe('CreateSituationDto', () => {
    it('INTERNAL válido, con o sin afectación inicial', async () => {
      expect(await errorsOf(CreateSituationDto, internal)).toEqual([]);
      expect(
        await errorsOf(CreateSituationDto, {
          ...internal,
          initialConsequence: { description: 'Se retrasó una entrega.' },
        }),
      ).toEqual([]);
    });

    it('reportKind es obligatorio (sin default silencioso)', async () => {
      const { reportKind: _omit, ...rest } = internal;
      expect(await errorsOf(CreateSituationDto, rest)).toContain('reportKind');
    });

    it('coordinationId es obligatorio también en INTERNAL', async () => {
      const { coordinationId: _omit, ...rest } = internal;
      expect(await errorsOf(CreateSituationDto, rest)).toContain(
        'coordinationId',
      );
    });

    it('la afectación inicial no admite texto en blanco ni más de 2000', async () => {
      expect(
        await errorsOf(CreateSituationDto, {
          ...internal,
          initialConsequence: { description: '   ' },
        }),
      ).toContain('description');
      expect(
        await errorsOf(CreateSituationDto, {
          ...internal,
          initialConsequence: { description: 'x'.repeat(2001) },
        }),
      ).toContain('description');
    });

    it('la afectación inicial no acepta fecha propia', async () => {
      expect(
        await errorsOf(CreateSituationDto, {
          ...internal,
          initialConsequence: {
            description: 'x',
            occurredAt: internal.occurredAt,
          },
        }),
      ).toContain('occurredAt');
    });
  });

  describe('CreateSituationConsequenceDto', () => {
    it('texto 1..2000, fecha opcional ISO', async () => {
      expect(
        await errorsOf(CreateSituationConsequenceDto, { description: 'ok' }),
      ).toEqual([]);
      expect(
        await errorsOf(CreateSituationConsequenceDto, {
          description: 'ok',
          occurredAt: 'ayer',
        }),
      ).toContain('occurredAt');
      expect(
        await errorsOf(CreateSituationConsequenceDto, {
          description: 'x'.repeat(2001),
        }),
      ).toContain('description');
    });
  });
});
