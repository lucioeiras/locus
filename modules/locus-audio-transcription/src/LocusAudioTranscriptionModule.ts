import { NativeModule, requireNativeModule } from 'expo';

declare class LocusAudioTranscriptionModule extends NativeModule {
  convertToWav(inputPath: string, outputPath: string): Promise<string>;
}

export default requireNativeModule<LocusAudioTranscriptionModule>('LocusAudioTranscription');
