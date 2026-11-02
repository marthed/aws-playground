import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetLatestConfigurationCommand } from '@aws-sdk/client-appconfigdata';
import { createFlagReader } from '../lambda/flags.mjs';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

function fakeClient(responses: unknown[]) {
    const calls: string[] = [];
    return {
        calls,
        send: async (command: object) => {
            calls.push(command.constructor.name);
            if (!(command instanceof GetLatestConfigurationCommand)) return { InitialConfigurationToken: 'start' };
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
        }
    };
}

test('serves the cached document until the poll interval passes', async () => {
    let time = 0;
    const flags = { express_checkout: { enabled: true } };
    const client = fakeClient([
        { Configuration: encode(flags), NextPollConfigurationToken: 'a', NextPollIntervalInSeconds: 60 },
        { Configuration: new Uint8Array(), NextPollConfigurationToken: 'b', NextPollIntervalInSeconds: 60 }
    ]);
    const read = createFlagReader(client, () => time);

    assert.deepEqual(await read(), flags);
    assert.deepEqual(await read(), flags);
    assert.equal(client.calls.length, 2, 'second read should not call AppConfig');

    time = 61_000;
    assert.deepEqual(await read(), flags, 'empty body means unchanged');
    assert.equal(client.calls.length, 3);
});

test('restarts the session when the token has expired', async () => {
    let time = 0;
    const flags = { express_checkout: { enabled: false } };
    const expired = Object.assign(new Error('expired'), { name: 'BadRequestException' });
    const client = fakeClient([
        { Configuration: encode(flags), NextPollConfigurationToken: 'a', NextPollIntervalInSeconds: 60 },
        expired,
        { Configuration: new Uint8Array(), NextPollConfigurationToken: 'b', NextPollIntervalInSeconds: 60 }
    ]);
    const read = createFlagReader(client, () => time);

    await read();
    time = 61_000;
    assert.deepEqual(await read(), flags);
});
