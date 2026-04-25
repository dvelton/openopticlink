import { decodePulseSamples, type MessageBundle, type PulseDecodeResult, type PulseSample } from './protocol';

const SAMPLE_WIDTH = 72;
const SAMPLE_HEIGHT = 54;
const TILE_COLUMNS = 12;
const TILE_ROWS = 9;
const TILE_WIDTH = SAMPLE_WIDTH / TILE_COLUMNS;
const TILE_HEIGHT = SAMPLE_HEIGHT / TILE_ROWS;
const SHORT_ANALYSIS_INTERVAL_MS = 220;
const MEDIUM_ANALYSIS_INTERVAL_MS = 600;
const LONG_ANALYSIS_INTERVAL_MS = 1000;

export interface PulseReceiverUpdate extends PulseDecodeResult {
  luma: number;
  sampleCount: number;
}

export class PulseReceiver {
  private stream?: MediaStream;
  private sampleTimer?: number;
  private readonly samples: PulseSample[] = [];
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d', { willReadFrequently: true });
  private lastAnalysis = 0;
  private lastBundleId = '';
  private generation = 0;
  private previousTileLumas: number[] = [];
  private readonly tileScores: number[] = [];

  async start(video: HTMLVideoElement, onUpdate: (update: PulseReceiverUpdate) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose camera access.');
    }
    if (!this.context) {
      throw new Error('Canvas sampling is not available in this browser.');
    }

    this.stop();
    const generation = ++this.generation;
    this.samples.length = 0;
    this.lastBundleId = '';
    this.previousTileLumas = [];
    this.tileScores.length = TILE_COLUMNS * TILE_ROWS;
    this.tileScores.fill(0);
    this.canvas.width = SAMPLE_WIDTH;
    this.canvas.height = SAMPLE_HEIGHT;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;
    try {
      video.srcObject = stream;
      await video.play();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      this.stream = undefined;
      throw error;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      this.stream = undefined;
      return;
    }

    const sample = () => {
      if (generation !== this.generation) {
        return;
      }

      const luma = this.sampleLuma(video);
      const now = performance.now();
      this.samples.push({ time: now, luma });
      this.trimSamples(now);

      if (now - this.lastAnalysis > this.analysisIntervalMs()) {
        this.lastAnalysis = now;
        const result = decodePulseSamples(this.samples);
        const bundle = this.deduplicateBundle(result.bundle);
        onUpdate({ ...result, bundle, luma, sampleCount: this.samples.length });
      }

      this.sampleTimer = window.setTimeout(sample, 60);
    };

    this.sampleTimer = window.setTimeout(sample, 60);
  }

  stop(): void {
    this.generation += 1;
    if (this.sampleTimer !== undefined) {
      window.clearTimeout(this.sampleTimer);
      this.sampleTimer = undefined;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    const video = document.querySelector<HTMLVideoElement>('#preview');
    if (video) {
      video.srcObject = null;
    }
    this.samples.length = 0;
    this.previousTileLumas = [];
    this.tileScores.fill(0);
  }

  private sampleLuma(video: HTMLVideoElement): number {
    if (!this.context || !video.videoWidth || !video.videoHeight) {
      return 0;
    }

    this.context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, this.canvas.width, this.canvas.height);
    const pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const tileLumas = this.measureTileLumas(pixels);
    const luma = this.pickSignalLuma(tileLumas);
    this.previousTileLumas = tileLumas;
    return luma;
  }

  private measureTileLumas(pixels: Uint8ClampedArray): number[] {
    const tileLumas: number[] = [];

    for (let tileRow = 0; tileRow < TILE_ROWS; tileRow += 1) {
      for (let tileColumn = 0; tileColumn < TILE_COLUMNS; tileColumn += 1) {
        tileLumas.push(this.measureTileLuma(pixels, tileColumn, tileRow));
      }
    }

    return tileLumas;
  }

  private measureTileLuma(pixels: Uint8ClampedArray, tileColumn: number, tileRow: number): number {
    let sum = 0;
    const startX = tileColumn * TILE_WIDTH;
    const startY = tileRow * TILE_HEIGHT;

    for (let y = startY; y < startY + TILE_HEIGHT; y += 1) {
      for (let x = startX; x < startX + TILE_WIDTH; x += 1) {
        const index = (y * SAMPLE_WIDTH + x) * 4;
        sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
      }
    }

    return sum / (TILE_WIDTH * TILE_HEIGHT);
  }

  private pickSignalLuma(tileLumas: number[]): number {
    let bestIndex = this.centerTileIndex();
    let bestScore = -1;
    const centerColumn = (TILE_COLUMNS - 1) / 2;
    const centerRow = (TILE_ROWS - 1) / 2;
    const maxDistance = Math.hypot(centerColumn, centerRow);

    for (let row = 0; row < TILE_ROWS; row += 1) {
      for (let column = 0; column < TILE_COLUMNS; column += 1) {
        const index = row * TILE_COLUMNS + column;
        const previous = this.previousTileLumas[index] ?? tileLumas[index];
        const delta = Math.abs(tileLumas[index] - previous);
        this.tileScores[index] = (this.tileScores[index] ?? 0) * 0.9 + delta;

        const distance = Math.hypot(column - centerColumn, row - centerRow);
        const centerBias = 1 - (distance / maxDistance) * 0.35;
        const score = this.tileScores[index] * centerBias;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
    }

    if (bestScore < 3) {
      return this.averageTiles(tileLumas, this.centerTileIndex(), 2);
    }

    return tileLumas[bestIndex] ?? 0;
  }

  private averageTiles(tileLumas: number[], centerIndex: number, radius: number): number {
    const centerColumn = centerIndex % TILE_COLUMNS;
    const centerRow = Math.floor(centerIndex / TILE_COLUMNS);
    let sum = 0;
    let count = 0;

    for (let row = Math.max(0, centerRow - radius); row <= Math.min(TILE_ROWS - 1, centerRow + radius); row += 1) {
      for (
        let column = Math.max(0, centerColumn - radius);
        column <= Math.min(TILE_COLUMNS - 1, centerColumn + radius);
        column += 1
      ) {
        sum += tileLumas[row * TILE_COLUMNS + column];
        count += 1;
      }
    }

    return count ? sum / count : 0;
  }

  private centerTileIndex(): number {
    return Math.floor(TILE_ROWS / 2) * TILE_COLUMNS + Math.floor(TILE_COLUMNS / 2);
  }

  private trimSamples(now: number): void {
    const windowMs = 900_000;
    while (this.samples.length && now - this.samples[0].time > windowMs) {
      this.samples.shift();
    }
  }

  private analysisIntervalMs(): number {
    if (this.samples.length > 5_000) {
      return LONG_ANALYSIS_INTERVAL_MS;
    }

    if (this.samples.length > 2_500) {
      return MEDIUM_ANALYSIS_INTERVAL_MS;
    }

    return SHORT_ANALYSIS_INTERVAL_MS;
  }

  private deduplicateBundle(bundle: MessageBundle | undefined): MessageBundle | undefined {
    if (!bundle || bundle.id === this.lastBundleId) {
      return undefined;
    }

    this.lastBundleId = bundle.id;
    return bundle;
  }
}
