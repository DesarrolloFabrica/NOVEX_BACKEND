import type { ConfigService } from '@nestjs/config';
import { SituationSlaScheduler } from '../situation-sla.scheduler';
import { SituationSweepController } from './situation-sweep.controller';
import type { SituationSweepService } from './situation-sweep.service';

/**
 * El escalamiento de severidad tiene su PROPIO interruptor
 * (`situationSweep.escalationEnabled` ← SEVERITY_ESCALATION_ENABLED), apagado
 * por defecto. El cron y el endpoint de Cloud Scheduler siguen haciendo
 * vencimientos y avisos de SLA, pero solo piden escalar si se activó.
 */
describe('barrido: interruptor de escalamiento', () => {
  function setup(config: Record<string, unknown>) {
    const run = jest.fn().mockResolvedValue({
      acquired: true,
      breached: 0,
      warned: 0,
      escalated: 0,
    });
    const sweepService = { run } as unknown as SituationSweepService;
    const configService = {
      get: (key: string) => config[key],
    } as unknown as ConfigService;
    return {
      run,
      scheduler: new SituationSlaScheduler(sweepService, configService),
      controller: new SituationSweepController(sweepService, configService),
    };
  }

  it('sin configurar: el cron barre SLA y NO pide escalar', async () => {
    const { run, scheduler } = setup({});
    await scheduler.processSlaSignals();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(expect.any(Date), { escalate: false });
  });

  it('con escalationEnabled=true el cron pide escalar', async () => {
    const { run, scheduler } = setup({
      'situationSweep.escalationEnabled': true,
    });
    await scheduler.processSlaSignals();
    expect(run).toHaveBeenCalledWith(expect.any(Date), { escalate: true });
  });

  it('apagar el cron no depende del escalamiento: cronEnabled=false no barre', async () => {
    const { run, scheduler } = setup({
      'situationSweep.cronEnabled': false,
      'situationSweep.escalationEnabled': true,
    });
    await scheduler.processSlaSignals();
    expect(run).not.toHaveBeenCalled();
  });

  it('el endpoint de Cloud Scheduler respeta el mismo interruptor', async () => {
    const off = setup({});
    await off.controller.run();
    expect(off.run).toHaveBeenCalledWith(expect.any(Date), { escalate: false });

    const on = setup({ 'situationSweep.escalationEnabled': true });
    await on.controller.run();
    expect(on.run).toHaveBeenCalledWith(expect.any(Date), { escalate: true });
  });
});
