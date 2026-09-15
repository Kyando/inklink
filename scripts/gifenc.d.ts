declare module 'gifenc' {
  export type Palette = number[][];

  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: Palette;
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(): Encoder;
  export function quantize(rgba: Uint8Array, maxColors: number, options?: { format?: string }): Palette;
  export function applyPalette(rgba: Uint8Array, palette: Palette, format?: string): Uint8Array;
}
