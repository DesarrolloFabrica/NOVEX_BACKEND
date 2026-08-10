import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListSituationsQueryDto } from '../../src/situations/dto/situation.dto';
import { PAGINATION_MAX_LIMIT } from '../../src/common/dto/pagination-query.dto';

describe('DB-001 pagination limits', () => {
  async function validateLimit(limit: unknown) {
    const dto = plainToInstance(ListSituationsQueryDto, { limit });
    return validate(dto);
  }

  it('acepta limit=1', async () => {
    const errors = await validateLimit(1);
    expect(errors).toHaveLength(0);
  });

  it(`acepta limit=${PAGINATION_MAX_LIMIT}`, async () => {
    const errors = await validateLimit(PAGINATION_MAX_LIMIT);
    expect(errors).toHaveLength(0);
  });

  it('rechaza limit=101', async () => {
    const errors = await validateLimit(101);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rechaza limit=1000000', async () => {
    const errors = await validateLimit(1_000_000);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rechaza limit=0', async () => {
    const errors = await validateLimit(0);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rechaza limit negativo', async () => {
    const errors = await validateLimit(-5);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('rechaza limit no numérico', async () => {
    const errors = await validateLimit('abc');
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });
});
