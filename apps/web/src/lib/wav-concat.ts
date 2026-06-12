export type WavPcm = {
  pcm: Buffer;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
};

/** Parse a standard PCM WAV (fmt + data chunks). */
export function readWavPcm(buffer: Buffer): WavPcm {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Invalid WAV file");
  }

  let offset = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);

    if (id === "fmt ") {
      const audioFormat = buffer.readUInt16LE(offset + 8);
      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAV audio format: ${audioFormat}`);
      }
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    }

    if (id === "data") {
      dataStart = offset + 8;
      dataLength = size;
    }

    offset += 8 + size + (size % 2);
  }

  if (dataStart < 0 || !sampleRate || !numChannels || !bitsPerSample) {
    throw new Error("WAV missing fmt or data chunk");
  }

  return {
    pcm: buffer.subarray(dataStart, dataStart + dataLength),
    sampleRate,
    numChannels,
    bitsPerSample,
  };
}

export function writeWavPcm({
  pcm,
  sampleRate,
  numChannels,
  bitsPerSample,
}: WavPcm): Buffer {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Concatenate PCM WAV files that share the same format. */
export function concatWav(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("Cannot concatenate empty WAV list");
  }
  if (buffers.length === 1) return buffers[0];

  const parsed = buffers.map(readWavPcm);
  const ref = parsed[0];

  for (const wav of parsed.slice(1)) {
    if (
      wav.sampleRate !== ref.sampleRate ||
      wav.numChannels !== ref.numChannels ||
      wav.bitsPerSample !== ref.bitsPerSample
    ) {
      throw new Error("WAV format mismatch between chunks");
    }
  }

  return writeWavPcm({
    pcm: Buffer.concat(parsed.map((wav) => wav.pcm)),
    sampleRate: ref.sampleRate,
    numChannels: ref.numChannels,
    bitsPerSample: ref.bitsPerSample,
  });
}
