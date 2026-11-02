# aws-behavior-tracking

Tracks what users do in a web app using only AWS services, with a small dummy shop to test it on.

| Service | Job |
| --- | --- |
| **CloudWatch RUM** | Collects page views, errors, performance and custom events from the browser |
| **AppConfig** | Holds feature flags, including the `express_checkout` A/B test |
| **Logs Insights** | Answers behaviour questions from the events RUM copies to CloudWatch Logs |

```
Browser ── events ──► CloudWatch RUM ──► CloudWatch Logs ──► Logs Insights saved queries
   ▲
   └── flags ── Lambda Function URL ── AppConfig (flags.json)
```

Flags go through a Lambda so the browser needs no AppConfig access and the function can cache the document.

## Try it locally, no AWS account needed

```sh
nvm use               # dependencies include native binaries, so install and run with the same Node
npm install
npm run dev:mock      # app on http://localhost:5173, mock RUM + flags on :4319
```

Click through the shop, then wait about 5 seconds for the client to send its batch:

```sh
npm run report        # sessions per funnel step, by variant
```

The mock uses the real `aws-rum-web` client and saves events to `mock/.data/rum-events.ndjson` in the CloudWatch Logs shape. To land in the other variant, clear the site's cookies, because the variant comes from the `cwr_u` user cookie.

## Deploy to AWS

You need AWS credentials in your shell. The AWS CLI is optional because the CDK runs from `node_modules`.

```sh
export AWS_REGION=eu-north-1
npm run cdk -w infra -- bootstrap    # once per account and region
npm run deploy                       # also writes app/.env.local
npm run dev                          # app on http://localhost:5173, sending to AWS
```

For a site that isn't on localhost, pass its origin so the monitor domain and CORS match:

```sh
npm run deploy -w infra -- -c siteOrigin=https://shop.example.com
node scripts/write-env.mjs
```

## Analyse behaviour

Open **CloudWatch → Logs Insights → Saved queries → behavior-tracking**. The queries live in `queries/`, and every `.logsinsights` file there is deployed as a saved query.

| Query | Answers |
| --- | --- |
| `funnel` | How many sessions reach each step? |
| `experiment-by-variant` | Does express checkout convert better? |
| `top-pages` | What do people look at? |
| `js-errors` | What is breaking for users? |
| `session-timeline` | What did one session do, in order? |

`experiment-by-variant` gives raw counts. Conversion is `shop.purchase_completed` divided by `shop.flag_exposure` for each variant.

## Change a flag

Edit `flags.json`, for example `rolloutPercent`, and run `npm run deploy`. The dummy shop picks up the change once the Lambda's next AppConfig poll and the 30-second response cache have passed.

Bucketing hashes the flag name with the RUM user ID, so a visitor stays in the same variant between visits. If flags can't be loaded, everyone gets `control`.

## Add an event

1. Add the name to `ShopEvent` in `app/src/tracking.ts`.
2. Call `track('shop.your_event', { variant, ... })`.

Anything starting with `shop.` appears in `funnel` automatically. Include `variant` if the event should count in experiments. Custom event names can only contain letters, digits, `_`, `-` and `.`.

## Before real users see this

- **Consent:** `allowCookies: true` sets the `cwr_u` and `cwr_s` cookies, which identify visitors and normally need consent under GDPR. Gate them with `rum.allowCookies()` and don't put personal data in event fields.
- **Log retention:** set a retention period on the RUM log group, shown in the `RumLogGroup` stack output. Otherwise, check its current setting so events aren't kept longer than you intend.
- **Costs:** RUM charges per event and CloudWatch Logs charges for storage and queries. `sessionSampleRate` in `app/src/tracking.ts` and `infra/lib/stack.ts` controls volume.
- **Public URL:** the flags Function URL has no auth, by design, so anyone can read flag values. Don't put secrets in `flags.json`.

## Tearing down

`npm run destroy -w infra` removes the stack. AppConfig hosted configuration versions are retained by the CDK, so the application and profile can fail to delete. If so, delete the leftover versions in the AppConfig console and run it again.

## Commands

| Command | Does |
| --- | --- |
| `npm test` | Stack assertions, flag Lambda and mock tests |
| `npm run typecheck` | Type-checks the app and infra |
| `npm run synth` | Generates the CloudFormation template without deploying |
