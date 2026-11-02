import { App } from 'aws-cdk-lib';
import { BehaviorTrackingStack } from '../lib/stack.ts';

const app = new App();
new BehaviorTrackingStack(app, 'BehaviorTracking', {
    siteOrigin: app.node.tryGetContext('siteOrigin') ?? 'http://localhost:5173'
});
