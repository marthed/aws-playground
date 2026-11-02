import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps, aws_appconfig as appconfig, aws_cognito as cognito, aws_iam as iam, aws_lambda as lambda, aws_logs as logs, aws_rum as rum, custom_resources as cr } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

const root = join(import.meta.dirname, '..', '..');
const APP_MONITOR_NAME = 'behavior-tracking-shop';

export interface BehaviorTrackingStackProps extends StackProps {
    /** Origin the app is served from, e.g. http://localhost:5173 */
    siteOrigin: string;
}

export class BehaviorTrackingStack extends Stack {
    constructor(scope: Construct, id: string, props: BehaviorTrackingStackProps) {
        super(scope, id, props);

        const monitorArn = this.formatArn({ service: 'rum', resource: 'appmonitor', resourceName: APP_MONITOR_NAME });

        // RUM: anonymous visitors get a Cognito guest identity that can only send events
        const identityPool = new cognito.CfnIdentityPool(this, 'RumIdentityPool', {
            allowUnauthenticatedIdentities: true
        });
        const guestRole = new iam.Role(this, 'RumGuestRole', {
            assumedBy: new iam.FederatedPrincipal(
                'cognito-identity.amazonaws.com',
                {
                    StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
                    'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
                },
                'sts:AssumeRoleWithWebIdentity'
            )
        });
        guestRole.addToPolicy(new iam.PolicyStatement({ actions: ['rum:PutRumEvents'], resources: [monitorArn] }));
        new cognito.CfnIdentityPoolRoleAttachment(this, 'RumIdentityPoolRoles', {
            identityPoolId: identityPool.ref,
            roles: { unauthenticated: guestRole.roleArn }
        });

        const monitor = new rum.CfnAppMonitor(this, 'AppMonitor', {
            name: APP_MONITOR_NAME,
            domain: new URL(props.siteOrigin).hostname,
            cwLogEnabled: true,
            customEvents: { status: 'ENABLED' },
            appMonitorConfiguration: {
                identityPoolId: identityPool.ref,
                guestRoleArn: guestRole.roleArn,
                allowCookies: true,
                sessionSampleRate: 1,
                telemetries: ['errors', 'performance', 'http']
            }
        });

        // RUM names the log group itself, so read the name back rather than constructing it
        const monitorLookup = new cr.AwsCustomResource(this, 'RumLogGroupLookup', {
            installLatestAwsSdk: false,
            onUpdate: {
                service: 'RUM',
                action: 'GetAppMonitor',
                parameters: { Name: monitor.ref },
                physicalResourceId: cr.PhysicalResourceId.of(monitor.attrId),
                outputPaths: ['AppMonitor.DataStorage.CwLog.CwLogGroup']
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [monitorArn] })
        });
        const logGroupName = monitorLookup.getResponseField('AppMonitor.DataStorage.CwLog.CwLogGroup');

        // Logs Insights: every file in queries/ becomes a saved query
        const queriesDir = join(root, 'queries');
        for (const file of readdirSync(queriesDir).filter((name) => name.endsWith('.logsinsights'))) {
            const name = basename(file, '.logsinsights');
            new logs.CfnQueryDefinition(this, `Query-${name}`, {
                name: `behavior-tracking/${name}`,
                queryString: readFileSync(join(queriesDir, file), 'utf8'),
                logGroupNames: [logGroupName]
            });
        }

        // AppConfig: flags.json is the deployed feature flag document
        const application = new appconfig.Application(this, 'FlagsApplication', {
            applicationName: 'behavior-tracking'
        });
        const environment = new appconfig.Environment(this, 'FlagsEnvironment', {
            application,
            environmentName: 'dev'
        });
        const flags = new appconfig.HostedConfiguration(this, 'Flags', {
            application,
            name: 'feature-flags',
            type: appconfig.ConfigurationType.FEATURE_FLAGS,
            content: appconfig.ConfigurationContent.fromFile(join(root, 'flags.json'), 'application/json'),
            deployTo: [environment],
            // The predefined all-at-once strategy bakes for 10 minutes, which makes every flag change that slow to deploy
            deploymentStrategy: new appconfig.DeploymentStrategy(this, 'Immediate', {
                rolloutStrategy: appconfig.RolloutStrategy.linear({
                    growthFactor: 100,
                    deploymentDuration: Duration.minutes(0),
                    finalBakeTime: Duration.minutes(0)
                })
            })
        });

        // The browser reads flags through this function so it never calls AppConfig directly
        const flagsFunction = new lambda.Function(this, 'FlagsFunction', {
            runtime: lambda.Runtime.NODEJS_24_X,
            handler: 'flags.handler',
            code: lambda.Code.fromAsset(join(import.meta.dirname, '..', 'lambda')),
            timeout: Duration.seconds(5),
            environment: {
                APPCONFIG_APPLICATION: application.applicationId,
                APPCONFIG_ENVIRONMENT: environment.environmentId,
                APPCONFIG_PROFILE: flags.configurationProfileId
            }
        });
        environment.grantReadConfig(flagsFunction);
        const flagsUrl = flagsFunction.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.NONE,
            cors: { allowedOrigins: [props.siteOrigin], allowedMethods: [lambda.HttpMethod.GET] }
        });

        new CfnOutput(this, 'Region', { value: this.region });
        new CfnOutput(this, 'AppMonitorId', { value: monitor.attrId });
        new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
        new CfnOutput(this, 'FlagsUrl', { value: flagsUrl.url });
        new CfnOutput(this, 'RumLogGroup', { value: logGroupName });
    }
}
