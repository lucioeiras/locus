package expo.modules.locusaudiotranscription

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LocusAudioTranscriptionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocusAudioTranscription")

    AsyncFunction("convertToWav") Coroutine { inputPath: String, outputPath: String ->
      withContext(Dispatchers.IO) { convertToWav(inputPath, outputPath) }
    }
  }

  private fun convertToWav(inputPath: String, outputPath: String): String {
    val source = File(Uri.decode(inputPath.removePrefix("file://")))
    val destination = File(Uri.decode(outputPath.removePrefix("file://")))
    destination.parentFile?.mkdirs()

    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    try {
      extractor.setDataSource(source.absolutePath)
      var audioFormat: MediaFormat? = null
      for (index in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(index)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("audio/")) {
          extractor.selectTrack(index)
          audioFormat = format
          break
        }
      }
      val inputFormat = audioFormat ?: error("No audio track found")
      val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: error("Unsupported audio format")
      val inputSampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val inputChannels = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      decoder = MediaCodec.createDecoderByType(mime)
      decoder.configure(inputFormat, null, null, 0)
      decoder.start()

      val info = MediaCodec.BufferInfo()
      var inputEnded = false
      var outputEnded = false
      var sampleRate = inputSampleRate
      var channels = inputChannels
      var dataSize = 0L
      FileOutputStream(destination).use { stream ->
        stream.write(ByteArray(44))
        while (!outputEnded) {
          if (!inputEnded) {
            val inputIndex = decoder.dequeueInputBuffer(10_000)
            if (inputIndex >= 0) {
              val inputBuffer = decoder.getInputBuffer(inputIndex) ?: error("Missing decoder input")
              inputBuffer.clear()
              val size = extractor.readSampleData(inputBuffer, 0)
              if (size < 0) {
                decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputEnded = true
              } else {
                decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }

          when (val outputIndex = decoder.dequeueOutputBuffer(info, 10_000)) {
            MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              val format = decoder.outputFormat
              sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
              channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
              val pcmEncoding = if (format.containsKey(MediaFormat.KEY_PCM_ENCODING))
                format.getInteger(MediaFormat.KEY_PCM_ENCODING) else 2
              check(pcmEncoding == 2) { "Only 16-bit PCM decoder output is supported" }
            }
            MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
            else -> if (outputIndex >= 0) {
              val outputBuffer = decoder.getOutputBuffer(outputIndex)
              if (info.size > 0 && outputBuffer != null) {
                outputBuffer.position(info.offset)
                outputBuffer.limit(info.offset + info.size)
                val bytes = ByteArray(info.size)
                outputBuffer.get(bytes)
                stream.write(bytes)
                dataSize += bytes.size
              }
              outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
              decoder.releaseOutputBuffer(outputIndex, false)
            }
          }
        }
      }

      check(dataSize > 0) { "Audio decoder returned no samples" }
      RandomAccessFile(destination, "rw").use { file ->
        file.seek(0)
        file.write("RIFF".toByteArray(Charsets.US_ASCII))
        file.writeIntLE((dataSize + 36).toInt())
        file.write("WAVEfmt ".toByteArray(Charsets.US_ASCII))
        file.writeIntLE(16)
        file.writeShortLE(1)
        file.writeShortLE(channels)
        file.writeIntLE(sampleRate)
        file.writeIntLE(sampleRate * channels * 2)
        file.writeShortLE(channels * 2)
        file.writeShortLE(16)
        file.write("data".toByteArray(Charsets.US_ASCII))
        file.writeIntLE(dataSize.toInt())
      }
      return destination.absolutePath
    } catch (error: Throwable) {
      destination.delete()
      throw error
    } finally {
      try { decoder?.stop() } catch (_: Exception) { }
      decoder?.release()
      extractor.release()
    }
  }

  private fun RandomAccessFile.writeIntLE(value: Int) {
    val buffer = java.nio.ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value)
    write(buffer.array())
  }

  private fun RandomAccessFile.writeShortLE(value: Int) {
    val buffer = java.nio.ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(value.toShort())
    write(buffer.array())
  }
}
