/**
 * Stub local de la API de Gemini para pruebas E2E. Responde con el análisis
 * válido de `valid-analysis.fixture.ts`, con retrasos y fallos controlados.
 *
 * Control (solo local):
 *   POST /__control  { "queue": [{ "delayMs": 3000 }, { "fail": true }] }
 *     Cada llamada de generateContent consume el siguiente paso; sin paso, responde al instante.
 *   GET  /__calls    número de llamadas recibidas desde el último control.
 *
 * Uso: npx ts-node -P tsconfig.typeorm.json test/e2e-support/gemini-stub.ts
 * Puerto: GEMINI_STUB_PORT (por defecto 4010). Escucha solo en 127.0.0.1.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { VALID_ANALYSIS_RESPONSE } from './valid-analysis.fixture';

interface Step {
  delayMs?: number;
  fail?: boolean;
}

let queue: Step[] = [];
let calls = 0;

const port = Number(process.env.GEMINI_STUB_PORT ?? 4010);

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer((req, res) => {
  void handle(req, res).catch(() => send(res, 500, { error: 'stub error' }));
});

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url ?? '';

  if (req.method === 'GET' && url === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url === '/__control') {
    const parsed = JSON.parse((await readBody(req)) || '{}') as {
      queue?: Step[];
    };
    queue = parsed.queue ?? [];
    calls = 0;
    send(res, 200, { queued: queue.length });
    return;
  }

  if (req.method === 'GET' && url === '/__calls') {
    send(res, 200, { calls });
    return;
  }

  if (req.method === 'POST' && url.includes(':generateContent')) {
    calls += 1;
    const step = queue.shift() ?? {};
    if (step.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    }
    if (step.fail) {
      send(res, 500, {
        error: { code: 500, message: 'stub failure', status: 'INTERNAL' },
      });
      return;
    }
    send(res, 200, {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: JSON.stringify(VALID_ANALYSIS_RESPONSE) }],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    });
    return;
  }

  send(res, 404, { error: 'not found' });
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Gemini stub escuchando en http://127.0.0.1:${port}`);
});
