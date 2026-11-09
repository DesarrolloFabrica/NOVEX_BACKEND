/**
 * Coordinación responsable de una situación en un instante histórico.
 * El primer traslado posterior al punto conserva la coordinación `from`; si
 * no hubo traslado posterior, rige la coordinación actual. Para cortes
 * exclusivos se incluye como posterior un traslado exactamente en el corte.
 */
export function responsibleCoordinationAtSql(
  situationAlias: string,
  instantSql: string,
  boundary: 'event' | 'exclusive-cut' = 'event',
): string {
  const operator = boundary === 'exclusive-cut' ? '>=' : '>';
  const futureTransfers = `SELECT 1 FROM situation_coordination_transfers tr
      WHERE tr.situation_id = ${situationAlias}.id
        AND tr.transferred_at ${operator} ${instantSql}`;
  const previousOwner = `SELECT tr.from_coordination_id
      FROM situation_coordination_transfers tr
      WHERE tr.situation_id = ${situationAlias}.id
        AND tr.transferred_at ${operator} ${instantSql}
      ORDER BY tr.transferred_at ASC, tr.id ASC
      LIMIT 1`;
  return `(CASE WHEN EXISTS (${futureTransfers})
    THEN (${previousOwner})
    ELSE ${situationAlias}.coordination_id END)`;
}
