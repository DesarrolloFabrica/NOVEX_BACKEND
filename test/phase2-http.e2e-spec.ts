import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GeminiProvider } from '../src/ai-orchestration/providers/gemini.provider';
import { buildAnalysisResult } from '../src/database/seeds/seed-situations-mock';
import { SituationSeverity } from '../src/common/enums/situation.enums';

/**
 * FASE 2 · PRUEBA HTTP CONTRA EL SERVICIO NEST REAL.
 *
 * Levanta la aplicación COMPLETA —guards de autenticación y permisos incluidos—
 * contra una base de datos AISLADA y desechable, y ejercita por HTTP lo que la
 * fase introduce: «mis reportes» entre coordinaciones, la lectura de un reporte
 * propio en otra área, y la resolución con aprendizaje.
 *
 * QUÉ SE SUSTITUYE Y QUÉ NO. Lo único reemplazado es el PROVEEDOR EXTERNO DE IA
 * (`GeminiProvider`), porque llamar a Gemini desde una prueba la haría depender
 * de una clave y de la red. Todo lo demás es real: el módulo de Nest, los
 * guards, el servicio, el repositorio, las transacciones y PostgreSQL. No hay
 * respuestas HTTP simuladas.
 *
 * REQUIERE `DB_*` apuntando a una base aislada. Nunca debe correrse contra una
 * base compartida: crea, cierra y borra datos.
 */

const ANALISIS_FALSO = buildAnalysisResult({
  title: 'Situación de prueba',
  categoryCode: 'TECH',
  categoryName: 'Técnica',
  severity: SituationSeverity.HIGH,
  coordinationCode: 'coord-a',
  affected: [],
  analyzedAt: new Date('2026-09-16T12:00:00.000Z'),
});

/** Doble del proveedor externo. Devuelve un análisis válido sin salir a la red. */
class GeminiProviderFalso {
  readonly name = 'stub-test';
  analyzeSituation() {
    return Promise.resolve(ANALISIS_FALSO);
  }
  executeAnalysis() {
    return Promise.resolve(ANALISIS_FALSO);
  }
}

describe('Fase 2 · HTTP real contra base aislada', () => {
  let app: INestApplication;
  let ds: DataSource;

  const ids = {
    areaA: '',
    areaB: '',
    categoria: '',
    coordA: '',
    coordB: '',
    admin: '',
    analista: '',
  };

  const token: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GeminiProvider)
      .useClass(GeminiProviderFalso)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    ds = app.get(DataSource);

    // El arranque siembra el catálogo de permisos y su reparto por rol
    // (CATALOG_SEED_ON_BOOT). Se espera a que termine antes de autenticar.
    await new Promise((r) => setTimeout(r, 1500));

    /*
     * La base es desechable, pero puede conservar datos de una ejecución
     * anterior. Se vacía lo que esta prueba escribe, en orden de dependencia.
     */
    await ds.query(
      'TRUNCATE situation_resolutions, situation_timeline_entries, situations, coordinations, incident_categories, audit_logs RESTART IDENTITY CASCADE',
    );
    await ds.query("DELETE FROM users WHERE email LIKE '%@t.co'");

    const uno = async (sql: string, params: unknown[] = []) =>
      (await ds.query(sql, params))[0];

    ids.areaA = (
      await uno(
        `INSERT INTO coordinations (code,name,short_name,color,icon,image_asset,display_order)
         VALUES ('coord-a','Área A','A','#fff','x','x.png',1) RETURNING id`,
      )
    ).id;
    ids.areaB = (
      await uno(
        `INSERT INTO coordinations (code,name,short_name,color,icon,image_asset,display_order)
         VALUES ('coord-b','Área B','B','#fff','x','x.png',2) RETURNING id`,
      )
    ).id;
    ids.categoria = (
      await uno(
        `INSERT INTO incident_categories (code,name) VALUES ('TECH','Técnica') RETURNING id`,
      )
    ).id;

    const crearUsuario = async (
      email: string,
      rol: string,
      coordinacion: string | null,
    ) =>
      (
        await uno(
          `INSERT INTO users (email, full_name, role_id, coordination_id)
           SELECT $1, $1, r.id, $3 FROM roles r WHERE r.code = $2 RETURNING id`,
          [email, rol, coordinacion],
        )
      ).id;

    ids.coordA = await crearUsuario('coord.a@t.co', 'COORDINADOR', ids.areaA);
    ids.coordB = await crearUsuario('coord.b@t.co', 'COORDINADOR', ids.areaB);
    ids.admin = await crearUsuario('admin@t.co', 'ADMIN', null);
    ids.analista = await crearUsuario('analista@t.co', 'ANALISTA', null);

    for (const email of [
      'coord.a@t.co',
      'coord.b@t.co',
      'admin@t.co',
      'analista@t.co',
    ]) {
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

  /** Crea un problema por HTTP, con el proveedor de IA sustituido. */
  async function reportar(email: string, coordinationId: string | null) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/situations/register-with-analysis')
      .set(auth(email))
      .send({
        title: `Reporte de ${email}`,
        description: 'Descripción de prueba suficientemente larga.',
        coordinationId: coordinationId ?? undefined,
        categoryId: ids.categoria,
        severity: 'HIGH',
        occurredAt: new Date(Date.now() - 3600_000).toISOString(),
      });
    return res;
  }

  describe('reportar entre coordinaciones', () => {
    it.each([
      ['admin@t.co', 'ADMIN'],
      ['analista@t.co', 'ANALISTA'],
      ['coord.b@t.co', 'COORDINADOR de otra área'],
    ])('%s registra en un área ajena (%s)', async (email) => {
      const res = await reportar(email, ids.areaA);
      expect(res.status).toBe(201);
      // La coordinación SELECCIONADA se conserva, no se sustituye.
      expect(res.body.situation.coordinationId).toBe(ids.areaA);
      // Y la autoría queda registrada aparte.
      expect(res.body.situation.createdByUserName).toBe(email);
    });

    it('rechaza una coordinación inexistente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/situations/register-with-analysis')
        .set(auth('admin@t.co'))
        .send({
          title: 'Coordinación fantasma',
          description: 'Descripción de prueba.',
          coordinationId: '00000000-0000-4000-8000-000000000999',
          categoryId: ids.categoria,
          severity: 'LOW',
          occurredAt: new Date(Date.now() - 3600_000).toISOString(),
        });
      expect(res.status).toBe(404);
    });
  });

  describe('«mis reportes» y lectura de lo propio', () => {
    it('devuelve solo los reportes del autor, de cualquier área', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/situations?mine=true&limit=50')
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(res.body.items.length).toBeGreaterThan(0);
      for (const item of res.body.items) {
        expect(item.createdByUserId).toBe(ids.coordB);
      }
      // Incluye el que registró en el ÁREA A, que no es la suya.
      expect(
        res.body.items.some(
          (i: { coordinationId: string }) => i.coordinationId === ids.areaA,
        ),
      ).toBe(true);
    });

    it('un coordinador LEE su reporte alojado en otra área', async () => {
      const mios = await request(app.getHttpServer())
        .get('/api/v1/situations?mine=true&limit=50')
        .set(auth('coord.b@t.co'))
        .expect(200);
      const ajeno = mios.body.items.find(
        (i: { coordinationId: string }) => i.coordinationId === ids.areaA,
      );

      const detalle = await request(app.getHttpServer())
        .get(`/api/v1/situations/${ajeno.id}`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(detalle.body.id).toBe(ajeno.id);
      // Verlo NO le concede resolverlo: el área responsable no es la suya.
      expect(detalle.body.canResolve).toBe(false);
    });

    it('NO puede leer un reporte AJENO de otra área', async () => {
      const delAdmin = await request(app.getHttpServer())
        .get('/api/v1/situations?mine=true&limit=50')
        .set(auth('admin@t.co'))
        .expect(200);
      const id = delAdmin.body.items[0].id;

      await request(app.getHttpServer())
        .get(`/api/v1/situations/${id}`)
        .set(auth('coord.b@t.co'))
        .expect(404);
    });

    it('el filtro por autor NO se puede falsear desde el cliente', async () => {
      // `createdByUserId` no es un parámetro admitido: el ValidationPipe con
      // whitelist lo descarta y el listado sigue siendo el del actor.
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?mine=true&createdByUserId=${ids.admin}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      for (const item of res.body.items) {
        expect(item.createdByUserId).toBe(ids.coordB);
      }
    });
  });

  describe('lista parcial de una coordinación ajena', () => {
    /*
     * REGRESIÓN de la fase 2.3. La guarda anterior devolvía una página VACÍA al
     * pedir otra coordinación, de modo que un coordinador veía «todo bajo
     * control» en un área crítica mientras el panel derecho le mostraba un
     * reporte propio y activo de esa misma área. La lista debe contener lo que
     * ese usuario SÍ puede leer, y declararlo.
     */
    let idPropioEnAreaAjena = '';

    beforeAll(async () => {
      const res = await reportar('coord.b@t.co', ids.areaA);
      idPropioEnAreaAjena = res.body.situation.id;
    });

    it('incluye el reporte PROPIO activo de esa coordinación', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaA}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(res.body.items.map((i: { id: string }) => i.id)).toContain(
        idPropioEnAreaAjena,
      );
    });

    it('declara que la lectura fue parcial', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaA}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(res.body.scope).toBe('own-only');
    });

    it('NO incluye los reportes ajenos de esa coordinación', async () => {
      const ajeno = await reportar('admin@t.co', ids.areaA);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaA}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      const ids_ = res.body.items.map((i: { id: string }) => i.id);
      expect(ids_).not.toContain(ajeno.body.situation.id);
      for (const item of res.body.items) {
        expect(item.createdByUserId).toBe(ids.coordB);
      }
    });

    it('NO sustituye la coordinación pedida por la propia', async () => {
      // Un reporte suyo en SU área no debe colarse en la lista de la ajena.
      const enSuArea = await reportar('coord.b@t.co', ids.areaB);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaA}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(
        enSuArea.body.situation.id,
      );
    });

    it('sobre SU propia coordinación la lectura es completa', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaB}&limit=50`)
        .set(auth('coord.b@t.co'))
        .expect(200);

      expect(res.body.scope).toBe('complete');
    });

    it('un rol no acotado por área lee completo en cualquier coordinación', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations?coordinationId=${ids.areaA}&limit=50`)
        .set(auth('admin@t.co'))
        .expect(200);

      expect(res.body.scope).toBe('complete');
    });
  });

  describe('resolución con aprendizaje', () => {
    let problemaDeA = '';

    beforeAll(async () => {
      const res = await reportar('admin@t.co', ids.areaA);
      problemaDeA = res.body.situation.id;
    });

    it('el coordinador del área responsable ve canResolve = true', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations/${problemaDeA}`)
        .set(auth('coord.a@t.co'))
        .expect(200);
      expect(res.body.canResolve).toBe(true);
    });

    it.each([
      ['admin@t.co', 'ADMIN, aunque lo reportó él'],
      ['analista@t.co', 'ANALISTA'],
      ['coord.b@t.co', 'COORDINADOR de otra área'],
    ])('rechaza a %s (%s)', async (email) => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/situations/${problemaDeA}/resolution`)
        .set(auth(email))
        .send({ learning: 'Intento no autorizado' });
      // 403 si tiene el permiso pero no la responsabilidad; 403 también si no
      // tiene el permiso. En ningún caso 200.
      expect(res.status).toBe(403);
    });

    it('rechaza un aprendizaje vacío', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/situations/${problemaDeA}/resolution`)
        .set(auth('coord.a@t.co'))
        .send({ learning: '   ' });
      expect(res.status).toBe(400);
    });

    it('el coordinador responsable resuelve y queda el aprendizaje', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/situations/${problemaDeA}/resolution`)
        .set(auth('coord.a@t.co'))
        .send({ learning: 'Faltó un plan de reversión documentado.' })
        .expect(201);

      expect(res.body.status).toBe('CLOSED');
      expect(res.body.resolution.learning).toBe(
        'Faltó un plan de reversión documentado.',
      );
      expect(res.body.resolution.resolvedByUserId).toBe(ids.coordA);
      expect(res.body.closedAt).not.toBeNull();
      // Ya cerrado: deja de ofrecerse la acción.
      expect(res.body.canResolve).toBe(false);
    });

    it('una segunda resolución no sobrescribe nada', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/situations/${problemaDeA}/resolution`)
        .set(auth('coord.a@t.co'))
        .send({ learning: 'Segundo intento' });
      expect(res.status).toBe(409);

      const detalle = await request(app.getHttpServer())
        .get(`/api/v1/situations/${problemaDeA}`)
        .set(auth('coord.a@t.co'))
        .expect(200);
      expect(detalle.body.resolution.learning).toBe(
        'Faltó un plan de reversión documentado.',
      );
    });

    it('el PATCH genérico no permite cerrar por otra vía', async () => {
      const otro = await reportar('admin@t.co', ids.areaA);
      const id = otro.body.situation.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/situations/${id}`)
        .set(auth('coord.a@t.co'))
        .send({ status: 'CLOSED', statusComment: 'Intento de atajo' });
      expect(res.status).toBe(403);

      const detalle = await request(app.getHttpServer())
        .get(`/api/v1/situations/${id}`)
        .set(auth('coord.a@t.co'))
        .expect(200);
      expect(detalle.body.status).toBe('OPEN');
    });

    it('un problema sin aprendizaje anterior sigue siendo legible', async () => {
      // Se cierra uno por SQL, como estaban los históricos, y se lee por HTTP.
      const creado = await reportar('admin@t.co', ids.areaA);
      const id = creado.body.situation.id;
      await ds.query(
        `UPDATE situations SET status='CLOSED', closed_at=now(), resolved_at=now() WHERE id=$1`,
        [id],
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/situations/${id}`)
        .set(auth('coord.a@t.co'))
        .expect(200);

      expect(res.body.status).toBe('CLOSED');
      // Ausencia legítima: null, sin texto inventado.
      expect(res.body.resolution).toBeNull();
      expect(res.body.canResolve).toBe(false);
    });
  });
});
