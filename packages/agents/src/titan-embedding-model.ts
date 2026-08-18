import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { MemoryEpisodeSchema } from '@mutex-memory/contracts';
import { z } from 'zod';
import type { EmbeddingModel } from './embedding-model.js';

export const TITAN_TEXT_EMBEDDINGS_V2_MODEL_ID =
  'amazon.titan-embed-text-v2:0';

export interface TitanInvokeRequest {
  modelId: string;
  contentType: 'application/json';
  accept: 'application/json';
  body: Uint8Array;
}

export interface TitanInvokeResponse {
  body: Uint8Array;
}

export type TitanInvoker = (
  request: TitanInvokeRequest,
) => Promise<TitanInvokeResponse>;

export interface TitanEmbeddingModelOptions {
  invoke: TitanInvoker;
  modelId?: string;
}

export interface TitanEmbeddingFactoryOptions {
  region: string;
  modelId?: string;
}

const CompactEmbeddingTextSchema = z.string().trim().min(1).max(20_000);
const TitanResponseSchema = z.object({
  embedding: MemoryEpisodeSchema.shape.embedding,
  inputTextTokenCount: z.number().int().nonnegative().optional(),
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class TitanEmbeddingResponseError extends Error {
  override readonly name = 'TitanEmbeddingResponseError';
}

function nativeRequest(inputText: string): Uint8Array {
  return encoder.encode(
    JSON.stringify({ inputText, dimensions: 512, normalize: true }),
  );
}

function parseEmbedding(response: TitanInvokeResponse): number[] {
  try {
    const json = JSON.parse(decoder.decode(response.body)) as unknown;
    const { embedding } = TitanResponseSchema.parse(json);
    const magnitude = Math.sqrt(
      embedding.reduce((sum, value) => sum + value ** 2, 0),
    );
    if (Math.abs(magnitude - 1) > 0.001) {
      throw new Error(`Titan embedding magnitude ${magnitude} is not normalized`);
    }
    return embedding;
  } catch (error) {
    throw new TitanEmbeddingResponseError(
      'Titan returned an invalid normalized 512-dimensional embedding',
      { cause: error },
    );
  }
}

export class TitanEmbeddingModel implements EmbeddingModel {
  private readonly invoke: TitanInvoker;
  private readonly modelId: string;

  constructor(options: TitanEmbeddingModelOptions) {
    this.invoke = options.invoke;
    this.modelId = z
      .string()
      .min(1)
      .parse(options.modelId ?? TITAN_TEXT_EMBEDDINGS_V2_MODEL_ID);
  }

  async embed(textInput: unknown): Promise<number[]> {
    const inputText = CompactEmbeddingTextSchema.parse(textInput);
    const response = await this.invoke({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: nativeRequest(inputText),
    });
    return parseEmbedding(response);
  }
}

export function createTitanEmbeddingModel(
  options: TitanEmbeddingFactoryOptions,
): TitanEmbeddingModel {
  const client = new BedrockRuntimeClient({ region: options.region });
  const modelOptions: TitanEmbeddingModelOptions = {
    invoke: async (request) => {
      const response = await client.send(new InvokeModelCommand(request));
      return { body: response.body };
    },
  };
  if (options.modelId !== undefined) {
    modelOptions.modelId = options.modelId;
  }
  return new TitanEmbeddingModel(modelOptions);
}
