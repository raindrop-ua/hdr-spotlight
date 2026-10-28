export interface Lut3D {
  title: string;
  size: number;
  domainMin: readonly [number, number, number];
  domainMax: readonly [number, number, number];
  /** RGB triplets, with red varying fastest, then green, then blue. */
  values: Float32Array<ArrayBuffer>;
}

export interface LutPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}
