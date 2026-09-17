/**
 * SERVIDOR NEST AISLADO para validación manual y de navegador.
 *
 * Levanta la aplicación COMPLETA —guards, servicios, repositorios y
 * transacciones reales— contra la base que indiquen las variables `DB_*`, que
 * debe ser una base DESECHABLE. Nunca debe apuntarse a la base habitual del
 * usuario: este servidor existe para crear y cerrar problemas de prueba.
 *
 * LO ÚNICO SUSTITUIDO es el proveedor externo de IA. `GeminiProvider` se
 * reemplaza por un doble que devuelve un análisis válido sin salir a la red,
 * porque depender de una clave de Gemini haría la validación irrepetible. El
 * resto del sistema es real, incluido el análisis que el registro persiste.
 *
 * Uso:  DB_PORT_LOCAL=... PORT=3999 ts-node test/isolated-server.ts
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { GeminiProvider } from '../src/ai-orchestration/providers/gemini.provider';
import { buildAnalysisResult } from '../src/database/seeds/seed-situations-mock';
import { SituationSeverity } from '../src/common/enums/situation.enums';

const ANALISIS = buildAnalysisResult({
  title: 'Análisis controlado de entorno aislado',
  categoryCode: 'TECH',
  categoryName: 'Técnica',
  severity: SituationSeverity.HIGH,
  coordinationCode: 'coord-a',
  affected: [],
  analyzedAt: new Date(),
});

/** Doble declarado del proveedor externo. No llama a Gemini. */
class GeminiProviderControlado {
  readonly name = 'stub-entorno-aislado';
  analyzeSituation() {
    return Promise.resolve(ANALISIS);
  }
  executeAnalysis() {
    return Promise.resolve(ANALISIS);
  }
}

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GeminiProvider)
    .useClass(GeminiProviderControlado)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT ?? 3999);
  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();
  console.log(`[aislado] Nest escuchando en ${url} (IA: doble controlado)`);
}

void main().catch((error) => {
  console.error('[aislado] fallo al arrancar', error);
  process.exit(1);
});

// `NestFactory` se importa para que el bundler conserve el contexto de Nest.
void NestFactory;
