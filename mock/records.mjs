import { gunzipSync } from 'node:zlib';

// Browsers with CompressionStream gzip the request
export function parseBatch(body, contentEncoding) {
    return JSON.parse((contentEncoding === 'gzip' ? gunzipSync(body) : body).toString('utf8'));
}

// Turns a PutRumEvents request into the records RUM writes to CloudWatch Logs, so the local
// data has the fields the Logs Insights queries use.
export function toLogRecords(batch) {
    return batch.RumEvents.map((event) => ({
        event_timestamp: new Date(event.timestamp * 1000).getTime(),
        event_type: event.type,
        event_id: event.id,
        application_id: batch.AppMonitorDetails.id,
        application_version: batch.AppMonitorDetails.version,
        metadata: JSON.parse(event.metadata ?? '{}'),
        user_details: { sessionId: batch.UserDetails.sessionId, userId: batch.UserDetails.userId },
        event_details: JSON.parse(event.details ?? '{}')
    }));
}

// Local stand-in for queries/experiment-by-variant.logsinsights
export function report(records) {
    const sessions = {};
    for (const { event_type, event_details, user_details } of records) {
        if (!event_type.startsWith('shop.') || !event_details.variant) continue;
        const steps = (sessions[event_details.variant] ??= {});
        (steps[event_type] ??= new Set()).add(user_details.sessionId);
    }
    return Object.fromEntries(
        Object.entries(sessions).map(([variant, steps]) => [
            variant,
            Object.fromEntries(Object.entries(steps).map(([step, ids]) => [step, ids.size]))
        ])
    );
}
