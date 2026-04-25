import { describe, expect, it } from 'vitest';
import {
  createMessageBundle,
  createRelayBundle,
  createTransmission,
  crc32,
  decodePulseBits,
  decodePulseSamples,
} from '../lib/protocol';

describe('protocol', () => {
  it('round trips a message through pulse bits', () => {
    const bundle = createMessageBundle('Meet at the north gate.');
    const transmission = createTransmission(bundle, 'far');
    const decoded = decodePulseBits(transmission.bits).bundle;

    expect(decoded?.body).toBe(bundle.body);
    expect(decoded?.kind).toBe(bundle.kind);
    expect(decoded?.createdAt.slice(0, 19)).toBe(bundle.createdAt.slice(0, 19));
  });

  it('decodes synthetic brightness samples', () => {
    const bundle = createMessageBundle('Pulse test.');
    const transmission = createTransmission(bundle, 'quick');
    const samples = transmission.symbols.flatMap((symbol, index) => [
      { time: index * transmission.profile.symbolMs + 20, luma: symbol === '1' ? 235 : 12 },
      { time: index * transmission.profile.symbolMs + transmission.profile.symbolMs / 2, luma: symbol === '1' ? 235 : 12 },
    ]);
    const decoded = decodePulseSamples(samples, [transmission.profile]);
    expect(decoded.bundle?.body).toBe(bundle.body);
  });

  it('decodes samples when sender timing drifts slightly', () => {
    const cases = [
      ['quick', 20],
      ['balanced', 10],
      ['far', 20],
    ] as const;

    for (const [profileId, driftMs] of cases) {
      const bundle = createMessageBundle(`Timing drift should still decode in ${profileId}.`);
      const transmission = createTransmission(bundle, profileId);
      const actualSymbolMs = transmission.profile.symbolMs + driftMs;
      const samples: { time: number; luma: number }[] = [];

      for (let time = 0; time <= transmission.symbols.length * actualSymbolMs; time += 60) {
        const symbolIndex = Math.floor((time + 20) / actualSymbolMs) % transmission.symbols.length;
        const symbol = transmission.symbols[symbolIndex];
        samples.push({ time, luma: symbol === '1' ? 235 : 12 });
      }

      const decoded = decodePulseSamples(samples, [transmission.profile]);
      expect(decoded.bundle?.body).toBe(bundle.body);
    }
  });

  it('decodes with stale brightness samples outside the active profile window', () => {
    const bundle = createMessageBundle('x'.repeat(80));
    const transmission = createTransmission(bundle, 'quick');
    const startTime = 300_000;
    const samples = [
      { time: 0, luma: 0 },
      { time: 1, luma: 255 },
    ];

    for (let index = 0; index < transmission.symbols.length; index += 1) {
      const symbol = transmission.symbols[index];
      samples.push({
        time: startTime + index * transmission.profile.symbolMs + transmission.profile.symbolMs / 2,
        luma: symbol === '1' ? 120 : 80,
      });
    }

    const decoded = decodePulseSamples(samples, [transmission.profile]);
    expect(decoded.bundle?.body).toBe(bundle.body);
  });

  it('rejects messages longer than the selected profile supports', () => {
    const bundle = createMessageBundle('x'.repeat(81));
    expect(() => createTransmission(bundle, 'quick')).toThrow(/QuickLink supports up to 80 bytes/);
  });

  it('uses a stable decoded id for repeated pulse streams', () => {
    const bundle = createMessageBundle('Repeat me.');
    const transmission = createTransmission(bundle, 'balanced');
    const first = decodePulseBits(transmission.bits).bundle;
    const second = decodePulseBits(transmission.bits).bundle;
    expect(first?.id).toBe(second?.id);
  });

  it('keeps separate ids for separate identical messages', () => {
    const first = createTransmission(createMessageBundle('Need help.'), 'balanced');
    const second = createTransmission(createMessageBundle('Need help.'), 'balanced');
    expect(decodePulseBits(first.bits).bundle?.id).not.toBe(decodePulseBits(second.bits).bundle?.id);
  });

  it('prefers the newest valid pulse packet in a retained sample window', () => {
    const first = createTransmission(createMessageBundle('first'), 'quick');
    const second = createTransmission(createMessageBundle('second'), 'quick');
    const decoded = decodePulseBits(`${first.bits}${second.bits}`).bundle;
    expect(decoded?.body).toBe('second');
  });

  it('rejects corrupted header metadata', () => {
    const transmission = createTransmission(createMessageBundle('Protect metadata'), 'balanced');
    const packetStart = 4 + 16 + 16;
    const messageIdBit = packetStart + 7 * 8;
    const corrupted = flipBit(transmission.bits, messageIdBit);
    expect(decodePulseBits(corrupted).bundle).toBeUndefined();
  });

  it('creates relay bundles with one fewer hop', () => {
    const bundle = createMessageBundle('Relay me', 'text', undefined, 3);
    const relay = createRelayBundle(bundle);
    expect(relay.kind).toBe('relay');
    expect(relay.hopsRemaining).toBe(2);
  });

  it('computes stable checksums', () => {
    expect(crc32('openopticlink')).toBe(crc32('openopticlink'));
    expect(crc32('openopticlink')).not.toBe(crc32('OpenOpticLink'));
  });
});

function flipBit(bits: string, index: number): string {
  const flipped = bits[index] === '1' ? '0' : '1';
  return `${bits.slice(0, index)}${flipped}${bits.slice(index + 1)}`;
}
