import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GeminiProvider } from '../src/ai-orchestration/providers/gemini.provider';
import { buildAnalysisResult } from '../src/database/seeds/seed-situations-mock';
import { SituationSeverity } from '../src/common/enums/situation.enums';

/**
 * FASE 2.1 · CONCURRENCIA REAL Y BLOQUEO PESIMISTA.
 *
 * Dos peticiones de resolución SUPERPUESTAS —lanzadas a la vez con
 * `Promise.all`, sin esperar a que la primera termine— contra el servicio Nest
 * real y PostgreSQL real. Una resolución enviada DESPUÉS de terminar la otra
 * solo comprobaría repetición secuencial; esto comprueba la carrera.
 *
 * Cubre además la corrección del bloqueo: `FOR UPDATE` sobre la fila desnuda.
 * Las relaciones eager de `Situation` se unen con LEFT JOIN y PostgreSQL
 * rechaza el bloqueo sobre ellas; si alguien quitara `loadEagerRelations: false`
 * TODA resolución volvería a devolver 500 y estas pruebas lo verían.
 *
 * Solo se sustituye el proveedor externo de IA. Requiere `DB_*` apuntando a una
 * base DESECHABLE.
 */

const ANALISIS = buildAnalysisResult({
  title: 'Concurrencia',
  categoryCode: 'TECH',
  categoryName: 'Técnica',
  severity: SituationSeverity.HIGH,
  coordinationCode: 'coord-x',
  affected: [],
  analyzedAt: new Date(),
});

class GeminiFalso {
  readonly name = 'stub-concurrencia';
  analyzeSituation() {
    return Promise.resolve(ANALISIS);
  }
  executeAnalysis() {
    return Promise.resolve(ANALISIS);
  }
}

describe('Fase 2.1 · resolución concurrente contra Nest real', () => {
  let app: INestApplication;
  let ds: DataSource;
  let areaId = '';
  let categoriaId = '';
  const token: Record<string, string> = {};
  const userId: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeminiProvider)
      .useClass(GeminiFalso)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    ds = app.get(DataSource);

    await new Promise((r) => setTimeout(r, 1500));

    await ds.query(
      'TRUNCATE situation_resolutions, situation_timeline_entries, situations, audit_logs RESTART IDENTITY CASCADE',
    );
    await ds.query("DELETE FROM users WHERE email LIKE '%@conc.co'");
    await ds.query("DELETE FROM coordinations WHERE code = 'coord-x'");
    await ds.query("DELETE FROM incident_categories WHERE code = 'CONC'");

    areaId = (
      await ds.query(
        `INSERT INTO coordinations (code,name,short_name,color,icon,image_asset,display_order)
         VALUES ('coord-x','Área X','X','#fff','x','x.png',90) RETURNING id`,
      )
    )[0].id;
    categoriaId = (
      await ds.query(
        `INSERT INTO incident_categories (code,name) VALUES ('CONC','Concurrencia') RETURNING id`,
      )
    )[0].id;

    // DOS coordinadores de la MISMA área: ambos autorizados a resolver.
    for (const email of ['uno@conc.co', 'dos@conc.co']) {
      const row = (
        await ds.query(
          `INSERT INTO users (email, full_name, role_id, coordination_id)
           SELECT $1, $1, r.id, $2 FROM roles r WHERE r.code = 'COORDINADOR'
           RETURNING id`,
          [email, areaId],
        )
      )[0];
      userId[email] = row.id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/email')
        .send({ email })
        .expect(201);
      token[email] = res.body.accessToken;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const auth = (email: string) => ({ Authorization: `Bearer ${token[email]}` });

  async function crearProblema(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/situations/register-with-analysis')
      .set(auth('uno@conc.co'))
      .send({
        title: 'Problema para la carrera',
        description: 'Descripción suficiente para la prueba de concurrencia.',
        coordinationId: areaId,
        categoryId: categoriaId,
        severity: 'HIGH',
        occurredAt: new Date(Date.now() - 3600_000).toISOString(),
      })
      .expect(201);
    return res.body.situation.id;
  }

  it('dos resoluciones SUPERPUESTAS: una gana, la otra recibe 409', async () => {
    const id = await crearProblema();

    /*
     * SIN `await` entre ellas: las dos peticiones salen antes de que ninguna
     * haya respondido, de modo que sus transacciones se solapan de verdad y el
     * bloqueo pesimista tiene que serializarlas.
     */
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/situations/${id}/resolution`)
        .set(auth('uno@conc.co'))
        .send({ learning: 'Aprendizaje de UNO' }),
      request(app.getHttpServer())
        .post(`/api/v1/situations/${id}/resolution`)
        .set(auth('dos@conc.co'))
        .send({ learning: 'Aprendizaje de DOS' }),
    ]);

    const estados = [a.status, b.status].sort();
    // Exactamente una gana. Nunca dos éxitos, nunca dos fracasos.
    expect(estados).toEqual([201, 409]);

    const ganadora = a.status === 201 ? a : b;
    const perdedora = a.status === 201 ? b : a;
    expect(perdedora.status).toBe(409);

    // UNA sola fila de aprendizaje, la del ganador, con su autoría.
    const filas = await ds.query(
      'SELECT learning, resolved_by_user_id FROM situation_resolutions WHERE situation_id = $1',
      [id],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].learning).toBe(ganadora.body.resolution.learning);
    expect(filas[0].resolved_by_user_id).toBe(
      ganadora.body.resolution.resolvedByUserId,
    );

    // Y UN solo evento de cierre en la línea de tiempo: no se duplica.
    const cierres = await ds.query(
      "SELECT count(*)::int AS n FROM situation_timeline_entries WHERE situation_id = $1 AND event_type = 'CLOSED'",
      [id],
    );
    expect(cierres[0].n).toBe(1);
  }, 60_000);

  it('cinco resoluciones simultáneas siguen dejando una sola', async () => {
    const id = await crearProblema();

    const respuestas = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/api/v1/situations/${id}/resolution`)
          .set(auth(i % 2 === 0 ? 'uno@conc.co' : 'dos@conc.co'))
          .send({ learning: `Aprendizaje simultáneo ${i}` }),
      ),
    );

    const exitos = respuestas.filter((r) => r.status === 201);
    expect(exitos).toHaveLength(1);
    for (const r of respuestas.filter((r) => r.status !== 201)) {
      expect(r.status).toBe(409);
    }

    const filas = await ds.query(
      'SELECT count(*)::int AS n FROM situation_resolutions WHERE situation_id = $1',
      [id],
    );
    expect(filas[0].n).toBe(1);
  }, 60_000);

  it('el bloqueo funciona: resolver NO devuelve 500 por las relaciones eager', async () => {
    /*
     * Esta es la prueba de regresión del fallo que la fase 1 dejó vivo: el
     * bloqueo pesimista sobre una entidad con relaciones EAGER producía
     * «FOR UPDATE cannot be applied to the nullable side of an outer join» y
     * toda resolución devolvía 500. Se comprueba contra el servicio real; un
     * EntityManager simulado no habría visto nunca ese error.
     */
    const id = await crearProblema();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/situations/${id}/resolution`)
      .set(auth('uno@conc.co'))
      .send({ learning: 'El bloqueo no revienta' });

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CLOSED');
  }, 60_000);
});
