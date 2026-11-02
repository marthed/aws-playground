import { AppConfigDataClient, GetLatestConfigurationCommand, StartConfigurationSessionCommand } from '@aws-sdk/client-appconfigdata';

const { APPCONFIG_APPLICATION, APPCONFIG_ENVIRONMENT, APPCONFIG_PROFILE } = process.env;

// AppConfig returns an empty body when nothing changed, so the last document is cached between
// invocations and only refreshed once the interval the service asked for has passed.
export function createFlagReader(client, now = Date.now) {
    let token;
    let flags;
    let nextPollAt = 0;

    async function startSession() {
        const session = await client.send(
            new StartConfigurationSessionCommand({
                ApplicationIdentifier: APPCONFIG_APPLICATION,
                EnvironmentIdentifier: APPCONFIG_ENVIRONMENT,
                ConfigurationProfileIdentifier: APPCONFIG_PROFILE
            })
        );
        return session.InitialConfigurationToken;
    }

    async function poll() {
        token ??= await startSession();
        try {
            return await client.send(new GetLatestConfigurationCommand({ ConfigurationToken: token }));
        } catch (error) {
            // Tokens expire after 24 hours, which an idle function can outlive
            if (error.name !== 'BadRequestException') throw error;
            token = await startSession();
            return client.send(new GetLatestConfigurationCommand({ ConfigurationToken: token }));
        }
    }

    return async function readFlags() {
        if (flags && now() < nextPollAt) return flags;
        const response = await poll();
        token = response.NextPollConfigurationToken;
        nextPollAt = now() + response.NextPollIntervalInSeconds * 1000;
        const body = response.Configuration && Buffer.from(response.Configuration).toString('utf8');
        if (body) flags = JSON.parse(body);
        return flags;
    };
}

const readFlags = createFlagReader(new AppConfigDataClient({}));

export async function handler() {
    return {
        statusCode: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30' },
        body: JSON.stringify(await readFlags())
    };
}
