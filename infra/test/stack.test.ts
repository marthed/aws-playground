import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BehaviorTrackingStack } from '../lib/stack.ts';

const template = Template.fromStack(
    new BehaviorTrackingStack(new App(), 'Test', { siteOrigin: 'http://localhost:5173' })
);

test('app monitor sends custom events and copies data to CloudWatch Logs', () => {
    template.hasResourceProperties('AWS::RUM::AppMonitor', {
        Domain: 'localhost',
        CwLogEnabled: true,
        CustomEvents: { Status: 'ENABLED' }
    });
});

test('guest role can only send events to the app monitor', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
            Statement: [Match.objectLike({ Action: 'rum:PutRumEvents', Effect: 'Allow', Resource: Match.anyValue() })]
        }
    });
});

test('flags are deployed as an AppConfig feature flag profile', () => {
    template.hasResourceProperties('AWS::AppConfig::ConfigurationProfile', { Type: 'AWS.AppConfig.FeatureFlags' });
    template.resourceCountIs('AWS::AppConfig::Deployment', 1);
    template.hasResourceProperties('AWS::AppConfig::DeploymentStrategy', {
        DeploymentDurationInMinutes: 0,
        FinalBakeTimeInMinutes: 0,
        GrowthFactor: 100
    });
});

test('flags function can read the configuration', () => {
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    assert.match(policies, /appconfig:GetLatestConfiguration/);
    assert.match(policies, /appconfig:StartConfigurationSession/);
});

test('every query file becomes a saved query against the RUM log group', () => {
    template.resourceCountIs('AWS::Logs::QueryDefinition', 5);
    template.allResourcesProperties('AWS::Logs::QueryDefinition', {
        LogGroupNames: [Match.objectLike({ 'Fn::GetAtt': Match.arrayWith(['AppMonitor.DataStorage.CwLog.CwLogGroup']) })]
    });
});
