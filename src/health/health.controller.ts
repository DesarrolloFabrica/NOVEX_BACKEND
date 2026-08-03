import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function resolveAppVersion(): string {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const raw = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

@Controller()
export class HealthController {
  private readonly version = resolveAppVersion();

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.configService.get<string>('nodeEnv') ?? 'development',
      version: this.version,
    };
  }

  @Get('health/ready')
  async getReady() {
    let database: 'up' | 'down' = 'down';

    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        database = 'up';
      }
    } catch {
      database = 'down';
    }

    const payload = {
      status: database === 'up' ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      environment: this.configService.get<string>('nodeEnv') ?? 'development',
      version: this.version,
      checks: {
        database,
      },
    };

    if (database === 'down') {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
