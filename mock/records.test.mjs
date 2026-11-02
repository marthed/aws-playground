import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { parseBatch, report, toLogRecords } from './records.mjs';

const batch = {
    AppMonitorDetails: { id: 'monitor', version: '0.1.0' },
    UserDetails: { sessionId: 's1', userId: 'u1' },
    RumEvents: [
        { id: '1', timestamp: 1700000000, type: 'shop.flag_exposure', metadata: '{"pageId":"/cart"}', details: '{"variant":"treatment"}' },
        { id: '2', timestamp: 1700000001, type: 'shop.purchase_completed', metadata: '{"pageId":"/thanks"}', details: '{"variant":"treatment","value":12}' },
        { id: '3', timestamp: 1700000002, type: 'com.amazon.rum.page_view_event', metadata: '{"pageId":"/"}', details: '{"pageId":"/"}' }
    ]
};

test('maps a batch to the CloudWatch Logs record shape', () => {
    const [record] = toLogRecords(batch);
    assert.equal(record.event_type, 'shop.flag_exposure');
    assert.equal(record.event_timestamp, 1700000000000);
    assert.equal(record.user_details.sessionId, 's1');
    assert.equal(record.metadata.pageId, '/cart');
    assert.equal(record.event_details.variant, 'treatment');
});

test('report counts sessions per variant and ignores other events', () => {
    assert.deepEqual(report(toLogRecords(batch)), {
        treatment: { 'shop.flag_exposure': 1, 'shop.purchase_completed': 1 }
    });
});

test('parses plain and gzipped request bodies', () => {
    const body = Buffer.from(JSON.stringify(batch));
    assert.deepEqual(parseBatch(body, undefined), batch);
    assert.deepEqual(parseBatch(gzipSync(body), 'gzip'), batch);
});
