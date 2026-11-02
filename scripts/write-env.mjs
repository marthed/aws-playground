import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const { BehaviorTracking: outputs } = JSON.parse(readFileSync(join(root, 'cdk-outputs.json'), 'utf8'));

writeFileSync(
    join(root, 'app', '.env.local'),
    `VITE_AWS_REGION=${outputs.Region}
VITE_RUM_APP_MONITOR_ID=${outputs.AppMonitorId}
VITE_RUM_IDENTITY_POOL_ID=${outputs.IdentityPoolId}
VITE_FLAGS_URL=${outputs.FlagsUrl}
`
);
console.log('Wrote app/.env.local');
