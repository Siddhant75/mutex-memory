# AWS Lambda Deployment

The backend deploys as one Lambda Function URL from `infra/lambda-stack.json`. These instructions create cloud resources; review the stack parameters and expected AWS charges before running them.

## Prerequisites

- AWS CLI authenticated to the target account and region.
- AWS SAM CLI.
- Bedrock access to the chosen proposal model and Amazon Titan Text Embeddings V2.
- An initialized CockroachDB Cloud database reachable from Lambda.

Keep AWS and CockroachDB in nearby regions when practical. The current CockroachDB demo cluster is in `ap-south-1`.

## 1. Build and Verify

```powershell
pnpm build:lambda
pnpm -r typecheck
pnpm test
sam validate --template-file infra/lambda-stack.json
```

The build creates the ignored artifact `dist/lambda/index.mjs`.

## 2. Store the Database URL

Create a local ignored file such as `database.secret.json`:

```json
{
  "DATABASE_URL": "postgresql://USERNAME:PASSWORD@HOST:26257/defaultdb?sslmode=verify-full"
}
```

Create the AWS secret without putting the URL in a committed file:

```powershell
aws secretsmanager create-secret `
  --name mutex-memory/database `
  --secret-string file://database.secret.json
```

Record the returned ARN. The template resolves the `DATABASE_URL` JSON key into the Lambda environment during stack deployment.

## 3. Deploy

```powershell
sam deploy `
  --template-file infra/lambda-stack.json `
  --stack-name mutex-memory-demo `
  --resolve-s3 `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides `
    AllowedOrigin=https://YOUR_FRONTEND_ORIGIN `
    BedrockModelId=YOUR_BEDROCK_MODEL_OR_INFERENCE_PROFILE_ID `
    DatabaseSecretArn=YOUR_SECRET_ARN
```

The Lambda execution role grants only `bedrock:InvokeModel`; its resource is wildcarded so the configured proposal model and Titan embedding model can both run. Tighten the resource list after the final model IDs are fixed.

Read the `DemoApiUrl` stack output, then seed cloud embeddings once:

```powershell
$apiUrl = 'https://YOUR_FUNCTION_URL'
Invoke-RestMethod -Method Post `
  -Uri "$apiUrl/demo/seed-memory" `
  -ContentType 'application/json' `
  -Body '{"embeddingMode":"titan"}'
```

Reset and run the submitted cloud flow:

```powershell
Invoke-RestMethod -Method Post -Uri "$apiUrl/demo/reset"
Invoke-RestMethod -Method Post `
  -Uri "$apiUrl/demo/run" `
  -ContentType 'application/json' `
  -Body '{"mode":"safe","agentMode":"bedrock"}'
```

## 4. Managed MCP Auditor

Configure Codex with:

```toml
[mcp_servers.cockroachdb-cloud]
url = "https://cockroachlabs.cloud/mcp"
```

Authenticate with `codex mcp login cockroachdb-cloud`, then verify with `/mcp`. Keep audit activity read-only. A useful demo prompt is:

> Inspect the Mutex Memory tables for case `20000000-0000-4000-8000-000000000001`. Explain why there is only one primary resolution, and show the case version, decision evidence, memory IDs, and outbox intent.

## Teardown

After the event, remove the Lambda stack and secret if they are no longer needed:

```powershell
sam delete --stack-name mutex-memory-demo
aws secretsmanager delete-secret --secret-id mutex-memory/database --recovery-window-in-days 7
```

Secret deletion remains recoverable during the seven-day window.
