import Foundation
import AVFoundation
import CoreMedia
import CoreVideo

// Uses the production MovieWriter with deterministic raw frames and PCM samples.
// No screen permission, game connection, or third-party codec is needed.
func testNativeMovieWriter() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("kancolle-native-test-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("native.mp4")
    let movie = try MovieWriter(path: url.path, width: 320, height: 240)
    for frame in 0..<90 {
        var pixel: CVPixelBuffer?
        guard CVPixelBufferCreate(nil, 320, 240, kCVPixelFormatType_32BGRA,
                                  [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pixel) == kCVReturnSuccess,
              let pixel else { throw problem("テスト映像を作成できません") }
        CVPixelBufferLockBaseAddress(pixel, [])
        let base = CVPixelBufferGetBaseAddress(pixel)!.assumingMemoryBound(to: UInt8.self)
        for y in 0..<240 {
            for x in 0..<320 {
                let offset = y * CVPixelBufferGetBytesPerRow(pixel) + x * 4
                base[offset] = 40; base[offset + 1] = UInt8(60 + frame); base[offset + 2] = 200; base[offset + 3] = 255
            }
        }
        CVPixelBufferUnlockBaseAddress(pixel, [])
        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: pixel, formatDescriptionOut: &format)
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 30),
                                        presentationTimeStamp: CMTime(value: Int64(frame), timescale: 30), decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: nil, imageBuffer: pixel, formatDescription: format!,
                                                 sampleTiming: &timing, sampleBufferOut: &sample)
        while movie.origin != nil && !movie.video.isReadyForMoreMediaData && movie.writer.status == .writing { usleep(1000) }
        movie.append(sample!, isVideo: true)
        // 1600 samples per 30fps frame yields an exactly aligned 48kHz audio clock.
        let count = 1600
        var samples = [Float](repeating: 0, count: count * 2)
        for i in 0..<count {
            let signal = Float(sin(Double(frame * count + i) * 2 * .pi * 440 / 48000) * 0.1)
            samples[i * 2] = signal; samples[i * 2 + 1] = signal
        }
        var asbd = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8,
            mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
        var audioFormat: CMAudioFormatDescription?
        CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil,
                                      magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &audioFormat)
        var block: CMBlockBuffer?
        CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: samples.count * 4,
            blockAllocator: nil, customBlockSource: nil, offsetToData: 0, dataLength: samples.count * 4, flags: 0, blockBufferOut: &block)
        _ = samples.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: $0.count) }
        var audioTiming = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 48000),
            presentationTimeStamp: CMTime(value: Int64(frame * count), timescale: 48000), decodeTimeStamp: .invalid)
        var size = 8
        var audioSample: CMSampleBuffer?
        CMSampleBufferCreateReady(allocator: nil, dataBuffer: block, formatDescription: audioFormat!,
            sampleCount: count, sampleTimingEntryCount: 1, sampleTimingArray: &audioTiming,
            sampleSizeEntryCount: 1, sampleSizeArray: &size, sampleBufferOut: &audioSample)
        while !movie.audio.isReadyForMoreMediaData && movie.writer.status == .writing { usleep(1000) }
        movie.append(audioSample!, isVideo: false)
    }
    try await movie.finish()
    let asset = AVURLAsset(url: url)
    let tracks = try await asset.load(.tracks)
    guard let video = tracks.first(where: { $0.mediaType == .video }),
          let audio = tracks.first(where: { $0.mediaType == .audio }) else { throw problem("映像・音声トラックがありません") }
    let videoFormats = try await video.load(.formatDescriptions)
    let audioFormats = try await audio.load(.formatDescriptions)
    guard CMFormatDescriptionGetMediaSubType(videoFormats[0]) == kCMVideoCodecType_H264,
          CMFormatDescriptionGetMediaSubType(audioFormats[0]) == kAudioFormatMPEG4AAC else { throw problem("H.264／AAC形式ではありません") }
    let duration = try await asset.load(.duration).seconds
    guard abs(duration - 3) < 0.1 else { throw problem("録画時間が不正です: \(duration)") }
    let reader = try AVAssetReader(asset: asset)
    let pcm = AVAssetReaderTrackOutput(track: audio, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMIsFloatKey: true, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsNonInterleaved: false])
    reader.add(pcm)
    guard reader.startReading() else { throw reader.error ?? problem("AACのデコードに失敗") }
    var maxAmplitude: Float = 0
    while let buffer = pcm.copyNextSampleBuffer() {
        guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
        var data = [Float](repeating: 0, count: CMBlockBufferGetDataLength(block) / 4)
        _ = data.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: $0.count, destination: $0.baseAddress!) }
        maxAmplitude = max(maxAmplitude, data.map { abs($0) }.max() ?? 0)
    }
    guard reader.status == .completed, maxAmplitude > 0.05 else { throw problem("AAC音声の信号を確認できません") }
    report(["event": "test-passed", "path": url.path, "duration": duration,
            "video": "H.264", "audio": "AAC", "maxAudioAmplitude": maxAmplitude,
            "encoderID": movie.encoderID])
}
