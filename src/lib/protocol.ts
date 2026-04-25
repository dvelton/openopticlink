export const PROTOCOL_VERSION = 'OOL1';
export const PULSE_PACKET_VERSION = 'OOLP1';

export type ProfileId = 'quick' | 'balanced' | 'far' | 'beacon';
export type MessageKind = 'text' | 'status' | 'location' | 'relay';

export interface TransmissionProfile {
  id: ProfileId;
  name: string;
  description: string;
  symbolMs: number;
  maxRecommendedChars: number;
  rangeHint: string;
}

export const PROFILES: Record<ProfileId, TransmissionProfile> = {
  quick: {
    id: 'quick',
    name: 'QuickLink',
    description: 'Fast pulse mode for phones held within arm\'s length.',
    symbolMs: 180,
    maxRecommendedChars: 80,
    rangeHint: 'Best at 0.2-1 m',
  },
  balanced: {
    id: 'balanced',
    name: 'FieldLink',
    description: 'The default full-screen pulse mode for mixed lighting and shaky hands.',
    symbolMs: 360,
    maxRecommendedChars: 120,
    rangeHint: 'Target 1-3 m',
  },
  far: {
    id: 'far',
    name: 'PulseLink Far',
    description: 'Slow white/black pulses for several meters with zoom or steady hands.',
    symbolMs: 760,
    maxRecommendedChars: 80,
    rangeHint: 'Try 3-10 m',
  },
  beacon: {
    id: 'beacon',
    name: 'PulseLink Beacon',
    description: 'Very slow full-screen pulses for short status messages at maximum contrast.',
    symbolMs: 1400,
    maxRecommendedChars: 40,
    rangeHint: 'Experimental 10 m+ in dark line of sight',
  },
};

export interface MessageBundle {
  id: string;
  createdAt: string;
  kind: MessageKind;
  body: string;
  title?: string;
  hopsRemaining: number;
}

export interface Transmission {
  bundle: MessageBundle;
  profile: TransmissionProfile;
  packetBytes: Uint8Array;
  checksum: string;
  bits: string;
  symbols: PulseSymbol[];
  payloadLength: number;
}

export interface ReceiveProgress {
  sessionId: string;
  profileId: ProfileId;
  received: number;
  total: number;
  complete: boolean;
  duplicate: boolean;
  bundle?: MessageBundle;
}

export interface PulseSample {
  time: number;
  luma: number;
}

export type PulseSymbol = '0' | '1';

export interface PulseDecodeResult {
  ok: boolean;
  status: string;
  profileId?: ProfileId;
  signalRange: number;
  threshold: number;
  bitsSeen: number;
  bundle?: MessageBundle;
  progress?: number;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const PULSE_PREAMBLE = '1010101010101010';
const PULSE_SYNC = '1110010110100001';
const PULSE_LEADER = '0000';
const PULSE_TRAILER = '000000';
const PULSE_MAGIC = [0x4f, 0x4c, 0x50, 0x31]; // OLP1
const PROFILE_ORDER: ProfileId[] = ['quick', 'balanced', 'far', 'beacon'];
const KIND_ORDER: MessageKind[] = ['text', 'status', 'location', 'relay'];
const TIMING_DRIFT_MS = [
  0,
  1,
  -1,
  2,
  -2,
  3,
  -3,
  5,
  -5,
  8,
  -8,
  10,
  -10,
  12,
  -12,
  15,
  -15,
  20,
  -20,
];
const MIN_PROFILE_WINDOW_MS = 120_000;
const PROFILE_WINDOW_PADDING = 1.35;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function crc32(input: string): string {
  return crc32Number(textEncoder.encode(input)).toString(36);
}

function crc32Number(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createMessageBundle(
  body: string,
  kind: MessageKind = 'text',
  title?: string,
  hopsRemaining = 4,
): MessageBundle {
  const cleanBody = body.trim();
  if (!cleanBody) {
    throw new Error('Message body cannot be empty.');
  }

  return {
    id: makeId(),
    createdAt: new Date().toISOString(),
    kind,
    body: cleanBody,
    title,
    hopsRemaining,
  };
}

export function createRelayBundle(bundle: MessageBundle): MessageBundle {
  if (bundle.hopsRemaining <= 0) {
    throw new Error('This message has no relay hops remaining.');
  }

  return {
    ...bundle,
    kind: 'relay',
    hopsRemaining: bundle.hopsRemaining - 1,
  };
}

export function createTransmission(bundle: MessageBundle, profileId: ProfileId): Transmission {
  const profile = PROFILES[profileId];
  const bodyBytes = textEncoder.encode(bundle.body);
  if (bodyBytes.length > profile.maxRecommendedChars) {
    throw new Error(`${profile.name} supports up to ${profile.maxRecommendedChars} bytes. Shorten the message or choose another profile.`);
  }

  if (bodyBytes.length > 65535) {
    throw new Error('Pulse messages must be shorter than 65,535 bytes.');
  }

  const messageIdBytes = messageIdToBytes(bundle.id);
  const createdAtSeconds = Math.floor(Date.parse(bundle.createdAt) / 1000);
  const packetBytes = new Uint8Array(25 + bodyBytes.length);
  packetBytes.set(PULSE_MAGIC, 0);
  packetBytes[4] = PROFILE_ORDER.indexOf(profileId);
  packetBytes[5] = KIND_ORDER.indexOf(bundle.kind);
  packetBytes[6] = Math.max(0, Math.min(255, bundle.hopsRemaining));
  packetBytes.set(messageIdBytes, 7);
  packetBytes[15] = (createdAtSeconds >>> 24) & 0xff;
  packetBytes[16] = (createdAtSeconds >>> 16) & 0xff;
  packetBytes[17] = (createdAtSeconds >>> 8) & 0xff;
  packetBytes[18] = createdAtSeconds & 0xff;
  packetBytes[19] = (bodyBytes.length >> 8) & 0xff;
  packetBytes[20] = bodyBytes.length & 0xff;
  packetBytes.set(bodyBytes, 25);
  const checksumNumber = pulsePacketChecksum(packetBytes);
  packetBytes[21] = (checksumNumber >>> 24) & 0xff;
  packetBytes[22] = (checksumNumber >>> 16) & 0xff;
  packetBytes[23] = (checksumNumber >>> 8) & 0xff;
  packetBytes[24] = checksumNumber & 0xff;

  const packetBits = bytesToBits(packetBytes);
  const bits = `${PULSE_LEADER}${PULSE_PREAMBLE}${PULSE_SYNC}${packetBits}${PULSE_TRAILER}`;
  const symbols = bits.split('') as PulseSymbol[];

  return {
    bundle,
    profile,
    packetBytes,
    checksum: checksumNumber.toString(36),
    bits,
    symbols,
    payloadLength: bodyBytes.length,
  };
}

export function estimateDurationSeconds(transmission: Transmission): number {
  return Math.ceil((transmission.symbols.length * transmission.profile.symbolMs) / 1000);
}

export function formatSymbolLabel(transmission: Transmission, symbolIndex: number): string {
  return `${symbolIndex + 1}/${transmission.symbols.length} ${transmission.profile.name}`;
}

export function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function decodePulseSamples(samples: PulseSample[], profiles = Object.values(PROFILES)): PulseDecodeResult {
  if (samples.length < 12) {
    return emptyDecode('Collecting brightness samples.', samples);
  }

  let bestProgress = 0;
  let bestBitsSeen = 0;
  let bestSignalRange = 0;
  let bestThreshold = 0;
  let hasStrongSignal = false;

  for (const profile of profiles) {
    const profileSamples = samplesForProfile(samples, profile);
    const { signalRange, threshold } = signalStats(profileSamples);
    if (signalRange > bestSignalRange) {
      bestSignalRange = signalRange;
      bestThreshold = threshold;
    }

    if (signalRange < 28) {
      continue;
    }

    hasStrongSignal = true;
    for (const symbolMs of timingCandidates(profile.symbolMs)) {
      const step = Math.max(40, Math.floor(symbolMs / 8));
      for (let offset = 0; offset < symbolMs; offset += step) {
        const bits = sampleBits(profileSamples, threshold, symbolMs, offset);
        bestBitsSeen = Math.max(bestBitsSeen, bits.length);
        const decoded = decodePulseBits(bits);
        bestProgress = Math.max(bestProgress, decoded.progress);

        if (decoded.bundle) {
          return {
            ok: true,
            status: 'Pulse message verified.',
            profileId: profile.id,
            signalRange,
            threshold,
            bitsSeen: bits.length,
            bundle: decoded.bundle,
            progress: 1,
          };
        }
      }
    }
  }

  if (!hasStrongSignal) {
    return {
      ok: false,
      status: 'Waiting for stronger white/black pulses.',
      signalRange: bestSignalRange,
      threshold: bestThreshold,
      bitsSeen: 0,
    };
  }

  return {
    ok: false,
    status: bestProgress > 0 ? `Receiving pulse packet (${Math.round(bestProgress * 100)}%).` : 'Looking for PulseLink preamble.',
    signalRange: bestSignalRange,
    threshold: bestThreshold,
    bitsSeen: bestBitsSeen,
    progress: bestProgress,
  };
}

export function textToBits(value: string): string {
  return bytesToBits(textEncoder.encode(value));
}

export function bitsToText(bits: string): string {
  return textDecoder.decode(bitsToBytes(bits));
}

export function decodePulseBits(bits: string): { bundle?: MessageBundle; progress: number } {
  const marker = `${PULSE_PREAMBLE}${PULSE_SYNC}`;
  let markerIndex = bits.indexOf(marker);
  let bestProgress = 0;
  let latestBundle: MessageBundle | undefined;

  while (markerIndex !== -1) {
    const decoded = decodePacketBits(bits.slice(markerIndex + marker.length));
    bestProgress = Math.max(bestProgress, decoded.progress);
    if (decoded.bundle) {
      latestBundle = decoded.bundle;
    }
    markerIndex = bits.indexOf(marker, markerIndex + 1);
  }

  return latestBundle ? { bundle: latestBundle, progress: 1 } : { progress: bestProgress };
}

function decodePacketBits(packetBits: string): { bundle?: MessageBundle; progress: number } {
  const packetBytes = bitsToBytes(packetBits);
  const header = parsePulsePacketPrefix(packetBytes);
  if (!header) {
    return { progress: 0.05 };
  }

  const availablePayload = packetBytes.slice(header.payloadStart, header.payloadStart + header.payloadLength);
  const progress = Math.min(0.98, availablePayload.length / header.payloadLength);
  if (availablePayload.length < header.payloadLength) {
    return { progress };
  }

  const fullPacket = packetBytes.slice(0, header.payloadStart + header.payloadLength);
  if (pulsePacketChecksum(fullPacket) !== header.checksum) {
    return { progress: 0.2 };
  }

  return {
    bundle: {
      id: makeDecodedId(header),
      createdAt: new Date(header.createdAtSeconds * 1000).toISOString(),
      kind: header.kind,
      body: textDecoder.decode(availablePayload),
      hopsRemaining: header.hopsRemaining,
    },
    progress: 1,
  };
}

function makeId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBits(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(8, '0')).join('');
}

function bitsToBytes(bits: string): Uint8Array {
  const byteCount = Math.floor(bits.length / 8);
  const bytes = new Uint8Array(byteCount);
  for (let index = 0; index < byteCount; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  return bytes;
}

function pulsePacketChecksum(packetBytes: Uint8Array): number {
  const protectedBytes = new Uint8Array(packetBytes);
  protectedBytes[21] = 0;
  protectedBytes[22] = 0;
  protectedBytes[23] = 0;
  protectedBytes[24] = 0;
  return crc32Number(protectedBytes);
}

function sampleBits(samples: PulseSample[], threshold: number, symbolMs: number, offset: number): string {
  const first = samples[0]?.time ?? 0;
  const last = samples.at(-1)?.time ?? 0;
  let cursor = 0;
  let bits = '';

  for (let target = first + offset + symbolMs / 2; target <= last; target += symbolMs) {
    while (cursor < samples.length - 2 && samples[cursor + 1].time < target) {
      cursor += 1;
    }

    const current = samples[cursor];
    const next = samples[cursor + 1] ?? current;
    const nearest = Math.abs(next.time - target) < Math.abs(current.time - target) ? next : current;
    bits += nearest.luma >= threshold ? '1' : '0';
  }

  return bits;
}

function timingCandidates(symbolMs: number): number[] {
  const maxDrift = Math.max(20, Math.round(symbolMs * 0.08));
  const candidates = new Set<number>();

  for (const drift of TIMING_DRIFT_MS) {
    if (Math.abs(drift) <= maxDrift) {
      candidates.add(symbolMs + drift);
    }
  }

  return [...candidates]
    .filter((candidate) => candidate >= 80)
    .sort((first, second) => Math.abs(first - symbolMs) - Math.abs(second - symbolMs));
}

function samplesForProfile(samples: PulseSample[], profile: TransmissionProfile): PulseSample[] {
  const lastTime = samples.at(-1)?.time;
  if (lastTime === undefined) {
    return samples;
  }

  const maxSymbols = PULSE_LEADER.length + PULSE_PREAMBLE.length + PULSE_SYNC.length + (25 + profile.maxRecommendedChars) * 8 + PULSE_TRAILER.length;
  const windowMs = Math.max(MIN_PROFILE_WINDOW_MS, maxSymbols * profile.symbolMs * PROFILE_WINDOW_PADDING);
  const cutoff = lastTime - windowMs;
  const startIndex = samples.findIndex((sample) => sample.time >= cutoff);
  return startIndex > 0 ? samples.slice(startIndex) : samples;
}

function signalStats(samples: PulseSample[]): { signalRange: number; threshold: number } {
  if (!samples.length) {
    return { signalRange: 0, threshold: 0 };
  }

  const lumas = samples.map((sample) => sample.luma);
  const min = Math.min(...lumas);
  const max = Math.max(...lumas);
  const signalRange = max - min;
  return { signalRange, threshold: min + signalRange / 2 };
}

function parsePulsePacketPrefix(bytes: Uint8Array):
  | {
      profileId: ProfileId;
      kind: MessageKind;
      hopsRemaining: number;
      messageId: string;
      createdAtSeconds: number;
      payloadLength: number;
      checksum: number;
      payloadStart: number;
    }
  | undefined {
  if (bytes.length < 25) {
    return undefined;
  }

  if (!PULSE_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return undefined;
  }

  const profileId = PROFILE_ORDER[bytes[4]];
  const kind = KIND_ORDER[bytes[5]];
  const hopsRemaining = bytes[6];
  const messageId = Array.from(bytes.slice(7, 15), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const createdAtSeconds = ((bytes[15] << 24) | (bytes[16] << 16) | (bytes[17] << 8) | bytes[18]) >>> 0;
  const payloadLength = (bytes[19] << 8) | bytes[20];
  const checksum = ((bytes[21] << 24) | (bytes[22] << 16) | (bytes[23] << 8) | bytes[24]) >>> 0;

  if (!profileId || !kind || payloadLength < 1) {
    return undefined;
  }

  return { profileId, kind, hopsRemaining, messageId, createdAtSeconds, payloadLength, checksum, payloadStart: 25 };
}

function makeDecodedId(header: { messageId: string }): string {
  return header.messageId;
}

function messageIdToBytes(id: string): Uint8Array {
  if (/^[0-9a-f]{16}$/i.test(id)) {
    return Uint8Array.from(id.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  }

  const fallback = crc32Number(textEncoder.encode(id));
  return Uint8Array.from([
    (fallback >>> 24) & 0xff,
    (fallback >>> 16) & 0xff,
    (fallback >>> 8) & 0xff,
    fallback & 0xff,
    (fallback >>> 24) & 0xff,
    (fallback >>> 16) & 0xff,
    (fallback >>> 8) & 0xff,
    fallback & 0xff,
  ]);
}

function emptyDecode(status: string, samples: PulseSample[]): PulseDecodeResult {
  const lumas = samples.map((sample) => sample.luma);
  const min = lumas.length ? Math.min(...lumas) : 0;
  const max = lumas.length ? Math.max(...lumas) : 0;
  const signalRange = max - min;
  return { ok: false, status, signalRange, threshold: min + signalRange / 2, bitsSeen: 0 };
}
