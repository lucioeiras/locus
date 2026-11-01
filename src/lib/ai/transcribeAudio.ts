import { File, Paths } from 'expo-file-system';

import { whisperModelManager } from './localModelManager';

type WhisperModule = typeof import('whisper.rn');
type AudioConverterModule = {
  convertToWav(inputPath: string, outputPath: string): Promise<string>;
};

let whisperModule: WhisperModule | null = null;
let converterModule: AudioConverterModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  whisperModule = require('whisper.rn');
} catch {
  // Native Whisper is unavailable in Expo Go and web builds.
}

try {
  converterModule =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/../modules/locus-audio-transcription/src/LocusAudioTranscriptionModule').default;
} catch {
  // The local converter is registered in iOS and Android development builds.
}

function nativePath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

export function isWhisperAvailable(): boolean {
  return Boolean(whisperModule && converterModule);
}

export async function transcribeAudio(uri: string): Promise<string> {
  if (!whisperModule || !converterModule) {
    throw new Error('Audio transcription requires an iOS or Android development build.');
  }
  if (!whisperModelManager.isModelDownloaded()) {
    throw new Error('Download the Whisper model in Settings before transcribing audio.');
  }

  const model = whisperModelManager.getModelFile();
  const wav = new File(
    Paths.cache,
    `transcription-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
  );
  const wavPath = nativePath(wav.uri);
  const audioPath = nativePath(uri);
  let context: Awaited<ReturnType<WhisperModule['initWhisper']>> | null = null;

  try {
    await converterModule.convertToWav(audioPath, wavPath);
    context = await whisperModule.initWhisper({ filePath: model.uri, useGpu: true, nThreads: 4 });
    const { promise } = context.transcribe(wavPath, { language: 'pt', maxThreads: 4 });
    const { result } = await promise;
    const transcript = result.trim();
    if (!transcript) throw new Error('No speech was detected in this audio.');
    return transcript;
  } finally {
    if (context) await context.release();
    if (wav.exists) wav.delete();
  }
}
