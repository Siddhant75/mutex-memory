export interface EmbeddingModel {
  embed(textInput: unknown): Promise<number[]>;
}
