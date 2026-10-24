// Records one window with ScreenCaptureKit into an H.264 movie, and writes the host time of the
// movie's first frame beside it. Python's time.monotonic() reads the same clock, so the driver's
// log lines up with the frames.
//
//   record <window title> <out.mov> [seconds]      stops after that long, or on SIGINT or SIGTERM
//
// Frames arrive only when the window changes, so the movie has a variable frame rate. The cut
// resamples it to the video's frame rate.
import AppKit
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

// Its state is touched only on `queue`, where ScreenCaptureKit delivers the frames.
final class Recorder: NSObject, SCStreamOutput, @unchecked Sendable {
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let sidecar: URL
    private let info: [String: Any]
    private var started = false
    private(set) var count = 0
    private let queue = DispatchQueue(label: "record")

    init(url: URL, width: Int, height: Int, info: [String: Any]) throws {
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            // The stream delivers sRGB, and video on the web is read as BT.709, whose primaries match.
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 60_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoExpectedSourceFrameRateKey: 60,
            ],
        ])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
        sidecar = url.deletingPathExtension().appendingPathExtension("json")
        self.info = info
        super.init()
    }

    var sampleQueue: DispatchQueue { queue }

    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, buffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = attachments.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(buffer)
        if !started {
            started = true
            writer.startWriting()
            writer.startSession(atSourceTime: time)
            var info = self.info
            info["firstFrameHostTime"] = time.seconds
            try? JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted]).write(to: sidecar)
        }
        if input.isReadyForMoreMediaData {
            input.append(buffer)
            count += 1
        }
    }

    func finish() async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            queue.async {
                guard self.started else { done.resume(); return }
                self.input.markAsFinished()
                self.writer.finishWriting { done.resume() }
            }
        }
    }
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

// ScreenCaptureKit's window filter needs a window-server connection, which NSApplication opens.
_ = NSApplication.shared

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: record <window title> <out.mov> [seconds]") }
let title = args[1]
let out = URL(fileURLWithPath: args[2])
let limit = args.count > 3 ? Double(args[3]) : nil

let stop = DispatchSemaphore(value: 0)
for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { stop.signal() }
    source.resume()
    // Kept alive for the life of the process.
    _ = Unmanaged.passRetained(source)
}

Task {
    do {
        let content = try await SCShareableContent.current
        guard let window = content.windows.first(where: { $0.title == title && $0.isOnScreen }) else {
            fail("record: no window titled \(title) on screen")
        }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let scale = Double(filter.pointPixelScale)
        let width = Int(window.frame.width * scale)
        let height = Int(window.frame.height * scale)
        let config = SCStreamConfiguration()
        config.width = width
        config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        config.showsCursor = false
        config.ignoreShadowsSingleWindow = true
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.queueDepth = 8
        let info: [String: Any] = [
            "window": title,
            "points": [window.frame.width, window.frame.height],
            "pixels": [width, height],
        ]
        let recorder = try Recorder(url: out, width: width, height: height, info: info)
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: recorder.sampleQueue)
        try await stream.startCapture()
        print("recording \(width)x\(height)")
        fflush(stdout)
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            DispatchQueue.global().async {
                if let limit { _ = stop.wait(timeout: .now() + limit) } else { stop.wait() }
                done.resume()
            }
        }
        try await stream.stopCapture()
        await recorder.finish()
        print("wrote \(out.path), \(recorder.count) frames")
        exit(0)
    } catch {
        fail("record: \(error.localizedDescription)")
    }
}
dispatchMain()
