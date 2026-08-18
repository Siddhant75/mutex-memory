import { describe, expect, it } from 'vitest';
import {
  TitanEmbeddingModel,
  TitanEmbeddingResponseError,
  type TitanInvokeRequest,
} from '../src/titan-embedding-model.js';

const encoder = new TextEncoder();

function responseBody(embedding: number[]): { body: Uint8Array } {
  return {
    body: encoder.encode(JSON.stringify({ embedding, inputTextTokenCount: 9 })),
  };
}

function unitVector(): number[] {
  return [1, ...Array<number>(511).fill(0)];
}

describe('TitanEmbeddingModel', () => {
  it('requests and returns a normalized 512-dimensional embedding', async () => {
    const requests: TitanInvokeRequest[] = [];
    const model = new TitanEmbeddingModel({
      invoke: async (request) => {
        requests.push(request);
        return responseBody(unitVector());
      },
    });

    const embedding = await model.embed('Lost package after carrier handoff.');

    expect(embedding).toEqual(unitVector());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      modelId: 'amazon.titan-embed-text-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
    });
    expect(JSON.parse(new TextDecoder().decode(requests[0]?.body))).toEqual({
      inputText: 'Lost package after carrier handoff.',
      dimensions: 512,
      normalize: true,
    });
  });

  it('rejects a response with the wrong vector dimension', async () => {
    const model = new TitanEmbeddingModel({
      invoke: async () => responseBody([1, 0, 0]),
    });

    await expect(model.embed('Compact case summary')).rejects.toBeInstanceOf(
      TitanEmbeddingResponseError,
    );
  });

  it('rejects a response that is not normalized', async () => {
    const model = new TitanEmbeddingModel({
      invoke: async () => responseBody(Array<number>(512).fill(1)),
    });

    await expect(model.embed('Compact case summary')).rejects.toBeInstanceOf(
      TitanEmbeddingResponseError,
    );
  });
});
