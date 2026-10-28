// OS frameworks only. No FFmpeg, OpenH264, x264, or bundled AAC encoder.
import Foundation
import AppKit
import ScreenCaptureKit
import AVFoundation
import VideoToolbox
import CoreMedia
import CoreVideo
import CoreAudio

func report(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    FileHandle.standardOutput.write(data + Data([10]))
}
func problem(_ message: String) -> NSError {
    NSError(domain: "KancolleRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
struct Configuration: Decodable {
    let windowID: UInt32
    let x: Double
    let y: Double
    let width: Int
    let height: Int
    let path: String
    let audioPIDs: [Int32]
}

// AVAssetWriter performs compression and muxing using macOS frameworks.
// Pin H.264 to an Apple encoder instead of selecting an installed third-party encoder.
final class MovieWriter {
    let writer: AVAssetWriter
    let video: AVAssetWriterInput
    let audio: AVAssetWriterInput
    let encoderID: String
    var origin: CMTime?
    var videoCount = 0
    var audioCount = 0
    var failure: Error?

    init(path: String, width: Int, height: Int) throws {
        var list: CFArray?
        guard VTCopyVideoEncoderList(nil, &list) == noErr,
              let encoders = list as? [[String: Any]] else {
            throw problem("macOSのH.264エンコーダーを列挙できませんでした。")
        }
        let candidates = encoders.filter {
            ($0[kVTVideoEncoderList_CodecType as String] as? NSNumber)?.uint32Value == kCMVideoCodecType_H264
            && ($0[kVTVideoEncoderList_EncoderID as String] as? String)?.hasPrefix("com.apple.") == true
        }.sorted {
            ($0[kVTVideoEncoderList_IsHardwareAccelerated as String] as? Bool ?? false)
                && !($1[kVTVideoEncoderList_IsHardwareAccelerated as String] as? Bool ?? false)
        }
        guard let id = candidates.first?[kVTVideoEncoderList_EncoderID as String] as? String else {
            throw problem("Apple提供のH.264エンコーダーが利用できません。")
        }
        encoderID = id
        writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: path), fileType: .mp4)
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoEncoderSpecificationKey: [kVTVideoEncoderSpecification_EncoderID as String: id],
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 6_000_000,
                AVVideoExpectedSourceFrameRateKey: 30,
                AVVideoMaxKeyFrameIntervalKey: 60,
                AVVideoAllowFrameReorderingKey: false
            ]
        ]
        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 128000
        ]
        guard writer.canApply(outputSettings: videoSettings, forMediaType: .video),
              writer.canApply(outputSettings: audioSettings, forMediaType: .audio) else {
            throw problem("macOSのH.264／AAC出力設定が利用できません。")
        }
        video = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        audio = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        video.expectsMediaDataInRealTime = true
        audio.expectsMediaDataInRealTime = true
        guard writer.canAdd(video), writer.canAdd(audio) else {
            throw problem("MP4の映像・音声トラックを作成できませんでした。")
        }
        writer.add(video)
        writer.add(audio)
        guard writer.startWriting() else { throw writer.error ?? problem("MP4の書き込みを開始できませんでした。") }
        report(["event": "diagnostic", "captureAPI": "ScreenCaptureKit",
                "writerAPI": "Apple AVFoundation AVAssetWriter", "videoEncoderID": encoderID,
                "audioAPI": "Apple AVFoundation AAC", "os": ProcessInfo.processInfo.operatingSystemVersionString,
                "width": width, "height": height])
    }

    // Called on a single serial queue for both tracks; no unbounded frame buffering.
    func append(_ buffer: CMSampleBuffer, isVideo: Bool) {
        guard failure == nil, buffer.isValid, CMSampleBufferDataIsReady(buffer) else { return }
        let time = buffer.presentationTimeStamp
        guard time.isValid else { return }
        if origin == nil {
            guard isVideo else { return }
            origin = time
            writer.startSession(atSourceTime: time)
        }
        guard let origin, CMTimeCompare(time, origin) >= 0 else { return }
        let input = isVideo ? video : audio
        guard input.isReadyForMoreMediaData else { return }
        if input.append(buffer) {
            if isVideo { videoCount += 1 } else { audioCount += 1 }
        } else {
            failure = writer.error ?? problem("MP4への書き込みに失敗しました。")
        }
    }

    func finish() async throws {
        if let failure { writer.cancelWriting(); throw failure }
        guard videoCount > 0, audioCount > 0 else {
            writer.cancelWriting()
            throw problem("映像またはアプリ音声のサンプルを取得できませんでした。録画権限と音声再生を確認してください。")
        }
        video.markAsFinished()
        audio.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? problem("MP4の保存に失敗しました。") }
        report(["event": "finished", "videoSamples": videoCount, "audioSamples": audioCount])
    }
}

@available(macOS 14.2, *)
final class ProcessAudioCapture {
    var tap: AudioObjectID = 0
    var device: AudioObjectID = 0
    var io: AudioDeviceIOProcID?

    func start(pids: [Int32], queue: DispatchQueue, receive: @escaping (CMSampleBuffer) -> Void) throws {
        let objects: [AudioObjectID] = pids.compactMap { value in
            var pid = value
            var object: AudioObjectID = 0
            var size = UInt32(MemoryLayout<AudioObjectID>.size)
            var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject,
                mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
            let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address,
                UInt32(MemoryLayout<Int32>.size), &pid, &size, &object)
            return status == noErr && object != 0 ? object : nil
        }
        guard !objects.isEmpty else { throw problem("このアプリの音声プロセスが見つかりません。ゲーム音声を再生してから録画してください。") }
        let description = CATapDescription(stereoMixdownOfProcesses: objects)
        description.name = "Kancolle app audio"
        description.isPrivate = true
        description.muteBehavior = .unmuted
        try check(AudioHardwareCreateProcessTap(description, &tap), "アプリ音声の取得を開始できません。システムオーディオ収録の権限を確認してください。")
        var asbd = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        var address = AudioObjectPropertyAddress(mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        try check(AudioObjectGetPropertyData(tap, &address, 0, nil, &size, &asbd), "音声形式を取得できません。")
        var format: CMAudioFormatDescription?
        try check(CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil,
            magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format), "音声形式を作成できません。")
        guard let format, asbd.mBytesPerFrame > 0, asbd.mSampleRate > 0 else { throw problem("音声形式が不正です。") }
        let aggregate: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Kancolle recording audio",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString,
                kAudioSubTapDriftCompensationKey: true]]
        ]
        try check(AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &device), "音声キャプチャデバイスを作成できません。")
        let bytesPerFrame = asbd.mBytesPerFrame
        let sampleRate = Int32(asbd.mSampleRate)
        try check(AudioDeviceCreateIOProcIDWithBlock(&io, device, queue) { _, input, time, _, _ in
            let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
            guard let first = buffers.first, first.mData != nil, first.mDataByteSize > 0 else { return }
            let frames = Int(first.mDataByteSize / bytesPerFrame)
            var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: sampleRate),
                presentationTimeStamp: CMClockMakeHostTimeFromSystemUnits(time.pointee.mHostTime), decodeTimeStamp: .invalid)
            var sample: CMSampleBuffer?
            guard CMSampleBufferCreate(allocator: nil, dataBuffer: nil, dataReady: false,
                makeDataReadyCallback: nil, refcon: nil, formatDescription: format, sampleCount: frames,
                sampleTimingEntryCount: 1, sampleTimingArray: &timing,
                sampleSizeEntryCount: 0, sampleSizeArray: nil, sampleBufferOut: &sample) == noErr,
                let sample,
                CMSampleBufferSetDataBufferFromAudioBufferList(sample, blockBufferAllocator: nil,
                    blockBufferMemoryAllocator: nil, flags: 0, bufferList: input) == noErr else { return }
            CMSampleBufferSetDataReady(sample)
            receive(sample)
        }, "音声キャプチャのコールバックを作成できません。")
        try check(AudioDeviceStart(device, io), "アプリ音声の取得を開始できません。")
        report(["event": "diagnostic", "audioCaptureAPI": "Apple Core Audio Process Tap",
                "audioProcessCount": objects.count, "sampleRate": sampleRate])
    }

    private func check(_ status: OSStatus, _ message: String) throws {
        guard status == noErr else { throw problem("\(message) (OSStatus \(status))") }
    }
    func stop() {
        if device != 0 {
            if let io { AudioDeviceStop(device, io); AudioDeviceDestroyIOProcID(device, io) }
            AudioHardwareDestroyAggregateDevice(device)
            device = 0
            io = nil
        }
        if tap != 0 { AudioHardwareDestroyProcessTap(tap); tap = 0 }
    }
    deinit { stop() }
}

@available(macOS 14.2, *)
final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "jp.ytokuda.kancolle.recording")
    var stream: SCStream?
    var audioCapture: ProcessAudioCapture?
    var movie: MovieWriter?
    var stopping = false

    func start(_ config: Configuration) async throws {
        guard config.width > 0, config.height > 0, config.width <= 1200, config.height <= 720,
              config.width % 2 == 0, config.height % 2 == 0,
              config.x >= 0, config.y >= 0 else { throw problem("録画領域が不正です。") }
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        } catch {
            throw problem("画面と音声を取得できません。システム設定の「プライバシーとセキュリティ」から画面収録を許可し、アプリを再起動してください。詳細: \(error.localizedDescription)")
        }
        guard let window = content.windows.first(where: { $0.windowID == config.windowID }) else {
            throw problem("録画対象のウィンドウが見つかりません。最小化を解除してください。")
        }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let settings = SCStreamConfiguration()
        settings.width = config.width
        settings.height = config.height
        settings.sourceRect = CGRect(x: config.x, y: config.y, width: Double(config.width), height: Double(config.height))
        settings.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        settings.pixelFormat = kCVPixelFormatType_32BGRA
        settings.queueDepth = 3
        settings.showsCursor = false
        settings.capturesAudio = false
        settings.excludesCurrentProcessAudio = false
        settings.sampleRate = 48000
        settings.channelCount = 2
        settings.ignoreShadowsSingleWindow = true
        movie = try MovieWriter(path: config.path, width: config.width, height: config.height)
        let capture = SCStream(filter: filter, configuration: settings, delegate: self)
        try capture.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        stream = capture
        // Resolve audio processes directly: SCShareableContent.applications omits
        // Electron's audio utility process, which can otherwise produce silence.
        let audio = ProcessAudioCapture()
        audioCapture = audio
        try audio.start(pids: config.audioPIDs, queue: queue) { [weak self] sample in
            guard let self, !self.stopping else { return }
            self.movie?.append(sample, isVideo: false)
            if let failure = self.movie?.failure { self.fatalRecordingError(failure) }
        }
        // Resolve audio permission before video starts, so time spent in a
        // permission dialog is not silently included in the recording.
        try await capture.startCapture()
        report(["event": "ready"])
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !stopping else { return }
        if type == .screen {
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let raw = attachments.first?[.status] as? Int,
                  SCFrameStatus(rawValue: raw) == .complete else { return }
            movie?.append(sampleBuffer, isVideo: true)
        } else if type == .audio {
            movie?.append(sampleBuffer, isVideo: false)
        }
        if let failure = movie?.failure { fatalRecordingError(failure) }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fatalRecordingError(error)
    }

    func fatalRecordingError(_ error: Error) {
        report(["event": "error", "error": error.localizedDescription])
        exit(1)
    }

    func stop(discard: Bool) async throws {
        if let stream { try await stream.stopCapture() }
        audioCapture?.stop()
        // Drain callbacks before finalizing the writer.
        await withCheckedContinuation { continuation in queue.async { self.stopping = true; continuation.resume() } }
        if discard { movie?.writer.cancelWriting(); return }
        guard let movie else { throw problem("録画が開始されていません。") }
        try await movie.finish()
    }
}

@main
struct Main {
    @MainActor
    static func main() async {
        // A command-line helper must establish its WindowServer connection before
        // ScreenCaptureKit starts (Electron's connection is in another process).
        NSApplication.shared.setActivationPolicy(.prohibited)
        #if RECORDER_SELF_TEST
        do { try await testNativeMovieWriter(); exit(0) }
        catch { report(["event": "error", "error": error.localizedDescription]); exit(1) }
        #else
        guard #available(macOS 14.2, *) else {
            report(["event": "error", "error": "OS標準録画にはmacOS 14.2以降が必要です。"])
            exit(1)
        }
        let recorder = Recorder()
        do {
            guard let line = readLine(), let data = line.data(using: .utf8) else {
                throw problem("録画設定を受信できませんでした。")
            }
            let config = try JSONDecoder().decode(Configuration.self, from: data)
            try await recorder.start(config)
            // stdin is a private pipe from Electron. EOF means its parent exited.
            let command = await Task.detached { readLine() }.value
            try await recorder.stop(discard: command != "stop")
        } catch {
            report(["event": "error", "error": error.localizedDescription])
            exit(1)
        }
        #endif
    }
}
