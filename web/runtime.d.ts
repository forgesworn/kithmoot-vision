/** Original MIT host. Supply locally bundled, verified WASM and weight bytes. */
export type VisionTask = 'both' | 'faces' | 'matte';
export interface VisionInput {
  rgb: Float32Array;
  reference?: Float32Array;
  previousAlpha?: Float32Array;
  width: number;
  height: number;
  tasks?: VisionTask;
}
/** Views expire on the next prepare/run/close. Copy arrays to retain them. */
export interface VisionOutput {
  alpha: Float32Array | null;
  faceLogits: Float32Array | null;
  faceGeometry: Float32Array | null;
  faceBoxes: Float32Array | null;
  facesUsable: boolean;
}
export class CameraVisionRuntime {
  private constructor();
  static create(wasmBytes: BufferSource, weightBytes: ArrayBuffer | Uint8Array, width?: number, height?: number): Promise<CameraVisionRuntime>;
  run(input: VisionInput): VisionOutput;
  readonly workspaceBytes: number;
  close(): void;
}
