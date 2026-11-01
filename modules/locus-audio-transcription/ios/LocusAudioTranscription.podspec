Pod::Spec.new do |s|
  s.name           = 'LocusAudioTranscription'
  s.version        = '1.0.0'
  s.summary        = 'Audio conversion for on-device transcription'
  s.description    = 'Converts recorded audio to PCM WAV for local Whisper transcription.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
