import AVFoundation
import ExpoModulesCore
import Foundation

public class LocusAudioTranscriptionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LocusAudioTranscription")

    AsyncFunction("convertToWav") { (inputPath: String, outputPath: String) async throws -> String in
      try await Task.detached(priority: .userInitiated) {
        try Self.convertToWav(inputPath: inputPath, outputPath: outputPath)
      }.value
    }
  }

  private static func convertToWav(inputPath: String, outputPath: String) throws -> String {
    let inputURL = URL(fileURLWithPath: inputPath.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    let input = try AVAudioFile(forReading: inputURL)
    guard let outputFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: 16_000,
      channels: 1,
      interleaved: false
    ) else {
      throw NSError(domain: "LocusAudioTranscription", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create WAV audio format"])
    }

    if FileManager.default.fileExists(atPath: outputURL.path) {
      try FileManager.default.removeItem(at: outputURL)
    }
    let output = try AVAudioFile(
      forWriting: outputURL,
      settings: outputFormat.settings,
      commonFormat: .pcmFormatInt16,
      interleaved: false
    )
    guard let converter = AVAudioConverter(from: input.processingFormat, to: outputFormat) else {
      throw NSError(domain: "LocusAudioTranscription", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not initialize audio converter"])
    }

    let inputCapacity: AVAudioFrameCount = 4096
    guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: inputCapacity),
      let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: 4096) else {
      throw NSError(domain: "LocusAudioTranscription", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not allocate audio conversion buffer"])
    }

    var reachedEnd = false
    while !reachedEnd {
      var conversionError: NSError?
      var inputReadError: Error?
      let status = converter.convert(to: outputBuffer, error: &conversionError) { _, inputStatus in
        if reachedEnd {
          inputStatus.pointee = .endOfStream
          return nil
        }
        let framesRemaining = input.length - input.framePosition
        if framesRemaining <= 0 {
          reachedEnd = true
          inputStatus.pointee = .endOfStream
          return nil
        }
        do {
          let framesToRead = AVAudioFrameCount(min(Int64(inputCapacity), framesRemaining))
          try input.read(into: inputBuffer, frameCount: framesToRead)
          if inputBuffer.frameLength == 0 {
            reachedEnd = true
            inputStatus.pointee = .endOfStream
            return nil
          }
          inputStatus.pointee = .haveData
          return inputBuffer
        } catch let error as NSError where error.domain == NSOSStatusErrorDomain && error.code == -39 {
          reachedEnd = true
          inputStatus.pointee = .endOfStream
          return nil
        } catch {
          inputReadError = error
          inputStatus.pointee = .noDataNow
          return nil
        }
      }

      if let conversionError { throw conversionError }
      if let inputReadError { throw inputReadError }
      if status == .error {
        throw NSError(domain: "LocusAudioTranscription", code: 4, userInfo: [NSLocalizedDescriptionKey: "Audio conversion failed"])
      }
      if outputBuffer.frameLength > 0 {
        try output.write(from: outputBuffer)
      }
      if status == .endOfStream { reachedEnd = true }
    }

    guard output.length > 0 else {
      throw NSError(domain: "LocusAudioTranscription", code: 5, userInfo: [NSLocalizedDescriptionKey: "No audio samples were decoded"])
    }
    return outputURL.path
  }
}
