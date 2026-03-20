/**
 * mc-kb — Shared type definitions
 *
 * IEmbedder: common interface for both in-process and daemon-backed embedders.
 */

export interface IEmbedder {
  isReady(): boolean;
  embed(text: string): Promise<Float32Array | null>;
  load(): Promise<void>;
  getDims(): number;
  dispose?(): Promise<void>;
}
