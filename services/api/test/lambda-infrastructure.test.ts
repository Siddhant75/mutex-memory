import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface LambdaTemplate {
  Transform?: string;
  Parameters?: Record<string, Record<string, unknown>>;
  Resources?: {
    DemoApiFunction?: {
      Type?: string;
      Properties?: Record<string, unknown>;
    };
  };
  Outputs?: Record<string, Record<string, unknown>>;
}

async function loadTemplate(): Promise<LambdaTemplate> {
  try {
    const source = await readFile(resolve('infra/lambda-stack.json'), 'utf8');
    return JSON.parse(source) as LambdaTemplate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

describe('Lambda infrastructure contract', () => {
  it('deploys the bundled handler behind a public Function URL', async () => {
    const template = await loadTemplate();

    expect(template.Transform).toBe('AWS::Serverless-2016-10-31');
    expect(template.Resources?.DemoApiFunction).toMatchObject({
      Type: 'AWS::Serverless::Function',
      Properties: {
        CodeUri: '../dist/lambda',
        Handler: 'index.handler',
        Runtime: 'nodejs22.x',
        FunctionUrlConfig: {
          AuthType: 'NONE',
          Cors: {
            AllowHeaders: ['content-type'],
            AllowMethods: ['GET', 'POST'],
            AllowOrigins: [{ Ref: 'AllowedOrigin' }],
          },
        },
      },
    });
    expect(template.Outputs?.DemoApiUrl).toEqual({
      Description: 'Public Mutex Memory demo API URL',
      Value: { 'Fn::GetAtt': ['DemoApiFunctionUrl', 'FunctionUrl'] },
    });
  });

  it('injects the database URL from a NoEcho Secrets Manager parameter', async () => {
    const template = await loadTemplate();
    const properties = template.Resources?.DemoApiFunction?.Properties;

    expect(template.Parameters?.DatabaseSecretArn).toMatchObject({
      Type: 'String',
      NoEcho: true,
    });
    expect(properties?.Environment).toEqual({
      Variables: {
        BEDROCK_MODEL_ID: { Ref: 'BedrockModelId' },
        DATABASE_URL: {
          'Fn::Sub':
            '{{resolve:secretsmanager:${DatabaseSecretArn}:SecretString:DATABASE_URL}}',
        },
      },
    });
    expect(JSON.stringify(template)).not.toContain('postgresql://');
  });

  it('limits the execution role to Bedrock model invocation', async () => {
    const template = await loadTemplate();
    const properties = template.Resources?.DemoApiFunction?.Properties;

    expect(properties?.Policies).toEqual([
      {
        Statement: [
          {
            Effect: 'Allow',
            Action: ['bedrock:InvokeModel'],
            Resource: '*',
          },
        ],
      },
    ]);
  });
});
