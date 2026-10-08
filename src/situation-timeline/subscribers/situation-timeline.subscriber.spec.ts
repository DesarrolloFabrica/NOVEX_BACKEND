import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { SituationTimelineSubscriber } from './situation-timeline.subscriber';

describe('SituationTimelineSubscriber · PATCH mixto', () => {
  const base = {
    id: 'sit-1',
    title: 'Título',
    description: 'Desc',
    coordinationId: 'c1',
    categoryId: 'cat',
    severity: SituationSeverity.MEDIUM,
    status: SituationStatus.OPEN,
    occurredAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  function build() {
    const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
    const dataSource = { subscribers: [] as unknown[] };
    const subscriber = new SituationTimelineSubscriber(
      dataSource as never,
      timelineService as never,
    );
    return { subscriber, timelineService };
  }

  it('un cambio de estado + título ya no pierde el título del timeline', async () => {
    const { subscriber, timelineService } = build();
    await subscriber.afterUpdate({
      databaseEntity: { ...base },
      entity: {
        ...base,
        status: SituationStatus.IN_PROGRESS,
        title: 'Título corregido',
      },
      manager: {},
    } as never);

    expect(timelineService.createEntry).toHaveBeenCalledTimes(1);
    const [entry] = timelineService.createEntry.mock.calls[0];
    expect(entry.eventType).toBe(TimelineEventType.UPDATED);
    expect(entry.metadata.fields).toEqual([
      { field: 'title', previousValue: 'Título', newValue: 'Título corregido' },
    ]);
  });

  it('un cambio SOLO de estado no emite nada (la transición la registra el servicio)', async () => {
    const { subscriber, timelineService } = build();
    await subscriber.afterUpdate({
      databaseEntity: { ...base },
      entity: { ...base, status: SituationStatus.CLOSED },
      manager: {},
    } as never);
    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('un UPDATE sin entidad de base (escalamiento sin listeners) no emite nada', async () => {
    const { subscriber, timelineService } = build();
    await subscriber.afterUpdate({
      databaseEntity: undefined,
      entity: { severity: SituationSeverity.HIGH },
      manager: {},
    } as never);
    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });
});
