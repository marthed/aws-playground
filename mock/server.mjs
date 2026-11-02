import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { parseBatch, report, toLogRecords } from './records.mjs';

const PORT = 4319;
const dataDir = join(import.meta.dirname, '.data');
const eventsFile = join(dataDir, 'rum-events.ndjson');
const flagsFile = join(import.meta.dirname, '..', 'flags.json');
mkdirSync(dataDir, { recursive: true });

const readRecords = () =>
    existsSync(eventsFile)
        ? readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
        : [];

function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
    res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    if (req.method === 'GET' && req.url === '/flags') return send(res, 200, JSON.parse(readFileSync(flagsFile, 'utf8')).values);
    if (req.method === 'GET' && req.url === '/report') return send(res, 200, report(readRecords()));
    if (req.method === 'GET' && req.url === '/events') return send(res, 200, readRecords());

    if (req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const records = toLogRecords(parseBatch(Buffer.concat(chunks), req.headers['content-encoding']));
        appendFileSync(eventsFile, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
        console.log(records.map((record) => record.event_type).join('\n'));
        return send(res, 200, {});
    }
    send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Mock RUM + flags on http://localhost:${PORT}`));
