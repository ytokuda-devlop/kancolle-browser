// First-party recorder. Only Windows system APIs; no third-party codec binaries.
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#define NTDDI_VERSION 0x0A000008
#include <windows.h>
#include <dwmapi.h>
#include <d3d11.h>
#include <dxgi.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <wmcodecdsp.h>
#include <codecapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

using namespace winrt;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;
using winrt::Windows::Data::Json::JsonObject;
using winrt::Windows::Data::Json::JsonValue;

void check(HRESULT hr) { check_hresult(hr); }
void require(bool value, wchar_t const* message) { if (!value) throw hresult_error(E_FAIL, message); }
void report(char const* event, std::wstring const& message = L"") {
    JsonObject json;
    json.Insert(L"event", JsonValue::CreateStringValue(to_hstring(event)));
    if (!message.empty()) json.Insert(L"error", JsonValue::CreateStringValue(message));
    std::cout << to_string(json.Stringify()) << std::endl;
}
int64_t clockTime() {
    LARGE_INTEGER value, frequency;
    QueryPerformanceCounter(&value); QueryPerformanceFrequency(&frequency);
    return value.QuadPart / frequency.QuadPart * 10000000
        + value.QuadPart % frequency.QuadPart * 10000000 / frequency.QuadPart;
}
struct Handle {
    HANDLE value;
    explicit Handle(HANDLE h) : value(h) { require(h && h != INVALID_HANDLE_VALUE, L"Windows handle creation failed."); }
    ~Handle() { CloseHandle(value); }
    Handle(Handle const&) = delete;
};
struct Config {
    HWND window{};
    DWORD pid{};
    int x{}, y{}, width{}, height{};
    std::wstring path;
    static Config read() {
        std::string line;
        // Do not let a buffered C/C++ stream prefetch later stop commands.
        for (;;) {
            char byte = 0; DWORD read = 0;
            require(ReadFile(GetStdHandle(STD_INPUT_HANDLE), &byte, 1, &read, nullptr) && read == 1,
                L"Missing recording configuration.");
            if (byte == '\n') break;
            line += byte;
            require(line.size() < 65536, L"Recording configuration is too large.");
        }
        auto json = JsonObject::Parse(to_hstring(line));
        Config c;
        auto handle = json.GetNamedString(L"windowHandle");
        size_t consumed = 0;
        auto number = std::stoull(handle.c_str(), &consumed, 16);
        require(consumed == handle.size(), L"Invalid window handle.");
        c.window = reinterpret_cast<HWND>(static_cast<uintptr_t>(number));
        auto integer = [&](wchar_t const* name, int low, int high) {
            double n = json.GetNamedNumber(name);
            require(std::isfinite(n) && n == std::floor(n) && n >= low && n <= high, L"Invalid recording configuration.");
            return static_cast<int>(n);
        };
        c.pid = static_cast<DWORD>(integer(L"processID", 1, INT_MAX));
        c.x = integer(L"x", 0, 32768); c.y = integer(L"y", 0, 32768);
        c.width = integer(L"width", 2, 1200); c.height = integer(L"height", 2, 720);
        c.path = json.GetNamedString(L"path").c_str();
        DWORD owner = 0; GetWindowThreadProcessId(c.window, &owner);
        require(IsWindow(c.window) && owner == c.pid && !IsIconic(c.window), L"Recording window is unavailable.");
        require(c.width % 2 == 0 && c.height % 2 == 0 && !c.path.empty(), L"Invalid recording size or path.");
        return c;
    }
};

com_ptr<IMFMediaType> mediaType(GUID const& major, GUID const& subtype) {
    com_ptr<IMFMediaType> type;
    check(MFCreateMediaType(type.put()));
    check(type->SetGUID(MF_MT_MAJOR_TYPE, major)); check(type->SetGUID(MF_MT_SUBTYPE, subtype));
    return type;
}
void videoType(IMFMediaType* type, int width, int height) {
    check(MFSetAttributeSize(type, MF_MT_FRAME_SIZE, width, height));
    check(MFSetAttributeRatio(type, MF_MT_FRAME_RATE, 30, 1));
    check(MFSetAttributeRatio(type, MF_MT_PIXEL_ASPECT_RATIO, 1, 1));
    check(type->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive));
}
void audioType(IMFMediaType* type, bool compressed) {
    check(type->SetUINT32(MF_MT_AUDIO_NUM_CHANNELS, 2));
    check(type->SetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND, 48000));
    check(type->SetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE, 16));
    check(type->SetUINT32(MF_MT_AUDIO_BLOCK_ALIGNMENT, compressed ? 1 : 4));
    check(type->SetUINT32(MF_MT_AUDIO_AVG_BYTES_PER_SECOND, compressed ? 16000 : 192000));
    if (compressed) {
        check(type->SetUINT32(MF_MT_AAC_PAYLOAD_TYPE, 0));
        check(type->SetUINT32(MF_MT_AAC_AUDIO_PROFILE_LEVEL_INDICATION, 0x29));
    }
}
com_ptr<IMFSample> sample(BYTE const* bytes, DWORD size, int64_t time, int64_t duration) {
    com_ptr<IMFMediaBuffer> buffer;
    check(MFCreateMemoryBuffer(size, buffer.put()));
    BYTE* target = nullptr; check(buffer->Lock(&target, nullptr, nullptr));
    if (bytes) memcpy(target, bytes, size); else memset(target, 0, size);
    check(buffer->Unlock()); check(buffer->SetCurrentLength(size));
    com_ptr<IMFSample> result; check(MFCreateSample(result.put()));
    check(result->AddBuffer(buffer.get()));
    check(result->SetSampleTime(time)); check(result->SetSampleDuration(duration));
    return result;
}

// Instantiate the Microsoft CLSIDs directly, rather than asking the system to
// choose an installed encoder. The sink writer receives compressed samples only.
struct Encoder {
    com_ptr<IMFTransform> transform;
    com_ptr<IMFMediaType> output;
    DWORD stream = 0;
    void create(GUID const& clsid, IMFMediaType* input, IMFMediaType* encoded) {
        check(CoCreateInstance(clsid, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(transform.put())));
        check(transform->SetOutputType(0, encoded, 0));
        check(transform->SetInputType(0, input, 0));
        check(transform->GetOutputCurrentType(0, output.put()));
    }
    void start() {
        check(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0));
        check(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0));
    }
    void outputSamples(IMFSinkWriter* writer) {
        for (;;) {
            MFT_OUTPUT_STREAM_INFO info{}; check(transform->GetOutputStreamInfo(0, &info));
            com_ptr<IMFSample> allocated;
            if (!(info.dwFlags & MFT_OUTPUT_STREAM_PROVIDES_SAMPLES)) {
                check(MFCreateSample(allocated.put()));
                com_ptr<IMFMediaBuffer> buffer;
                check(MFCreateAlignedMemoryBuffer(std::max<DWORD>(info.cbSize, 1),
                    info.cbAlignment ? info.cbAlignment - 1 : 0, buffer.put()));
                check(allocated->AddBuffer(buffer.get()));
            }
            MFT_OUTPUT_DATA_BUFFER data{}; data.pSample = allocated.get();
            DWORD status = 0;
            HRESULT hr = transform->ProcessOutput(0, 1, &data, &status);
            if (data.pEvents) data.pEvents->Release();
            com_ptr<IMFSample> supplied;
            if (data.pSample && data.pSample != allocated.get()) supplied.attach(data.pSample);
            if (hr == MF_E_TRANSFORM_NEED_MORE_INPUT) return;
            // Format changes are unexpected for these fixed-format encoders.
            check(hr);
            require(data.pSample != nullptr, L"Encoder returned no sample.");
            check(writer->WriteSample(stream, data.pSample));
        }
    }
    void append(IMFSinkWriter* writer, IMFSample* value) {
        HRESULT hr = transform->ProcessInput(0, value, 0);
        if (hr == MF_E_NOTACCEPTING) { outputSamples(writer); hr = transform->ProcessInput(0, value, 0); }
        check(hr); outputSamples(writer);
    }
    void drain(IMFSinkWriter* writer) {
        check(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0));
        check(transform->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0));
        outputSamples(writer);
        check(transform->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0));
    }
};
struct Movie {
    Encoder video, audio;
    com_ptr<IMFSinkWriter> writer;
    uint64_t videoCount = 0, audioFrames = 0;
    Movie(std::wstring const& path, int width, int height) {
        auto nv12 = mediaType(MFMediaType_Video, MFVideoFormat_NV12); videoType(nv12.get(), width, height);
        auto h264 = mediaType(MFMediaType_Video, MFVideoFormat_H264); videoType(h264.get(), width, height);
        check(h264->SetUINT32(MF_MT_AVG_BITRATE, 6000000));
        check(h264->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Main));
        video.create(CLSID_CMSH264EncoderMFT, nv12.get(), h264.get());
        auto pcm = mediaType(MFMediaType_Audio, MFAudioFormat_PCM); audioType(pcm.get(), false);
        auto aac = mediaType(MFMediaType_Audio, MFAudioFormat_AAC); audioType(aac.get(), true);
        audio.create(CLSID_AACMFTEncoder, pcm.get(), aac.get());
        com_ptr<IMFAttributes> attributes; check(MFCreateAttributes(attributes.put(), 2));
        check(attributes->SetUINT32(MF_READWRITE_DISABLE_CONVERTERS, TRUE));
        check(attributes->SetUINT32(MF_SINK_WRITER_DISABLE_THROTTLING, TRUE));
        check(MFCreateSinkWriterFromURL(path.c_str(), nullptr, attributes.get(), writer.put()));
        check(writer->AddStream(video.output.get(), &video.stream));
        check(writer->SetInputMediaType(video.stream, video.output.get(), nullptr));
        check(writer->AddStream(audio.output.get(), &audio.stream));
        check(writer->SetInputMediaType(audio.stream, audio.output.get(), nullptr));
        check(writer->BeginWriting()); video.start(); audio.start();
        std::cout << "{\"event\":\"diagnostic\",\"captureAPI\":\"Windows Graphics Capture\","
            "\"audioCaptureAPI\":\"WASAPI process loopback\",\"writerAPI\":\"Media Foundation MP4 sink\","
            "\"videoEncoder\":\"Microsoft CLSID_CMSH264EncoderMFT\",\"audioEncoder\":\"Microsoft CLSID_AACMFTEncoder\"}" << std::endl;
    }
    void videoSample(std::vector<BYTE> const& bytes, int64_t time) {
        auto value = sample(bytes.data(), static_cast<DWORD>(bytes.size()), time, 10000000 / 30);
        video.append(writer.get(), value.get()); ++videoCount;
    }
    void audioSample(BYTE const* bytes, UINT32 frames) {
        auto time = static_cast<int64_t>(audioFrames * 10000000 / 48000);
        auto end = static_cast<int64_t>((audioFrames + frames) * 10000000 / 48000);
        auto value = sample(bytes, frames * 4, time, end - time);
        audio.append(writer.get(), value.get()); audioFrames += frames;
    }
    void silenceUntil(uint64_t frame) {
        while (audioFrames < frame) audioSample(nullptr, static_cast<UINT32>(std::min<uint64_t>(480, frame - audioFrames)));
    }
    void finish() {
        require(videoCount > 0, L"No window frames were captured.");
        video.drain(writer.get()); audio.drain(writer.get()); check(writer->Finalize());
        report("finished");
    }
};

// Completion runs on an MTA thread. The event also keeps activation off the UI.
struct Activation : implements<Activation, IActivateAudioInterfaceCompletionHandler, IAgileObject> {
    Handle done{CreateEventW(nullptr, TRUE, FALSE, nullptr)};
    HRESULT result = E_PENDING;
    com_ptr<IAudioClient> client;
    HRESULT __stdcall ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) noexcept override {
        com_ptr<IUnknown> object;
        HRESULT activationResult = E_FAIL;
        result = operation->GetActivateResult(&activationResult, object.put());
        if (SUCCEEDED(result)) result = activationResult;
        if (SUCCEEDED(result)) result = object->QueryInterface(IID_PPV_ARGS(client.put()));
        SetEvent(done.value); return S_OK;
    }
};
struct AudioCapture {
    com_ptr<IAudioClient> client;
    com_ptr<IAudioCaptureClient> capture;
    AudioCapture(DWORD pid) {
        auto callback = make_self<Activation>();
        AUDIOCLIENT_ACTIVATION_PARAMS parameters{};
        parameters.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
        parameters.ProcessLoopbackParams.TargetProcessId = pid;
        parameters.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
        PROPVARIANT variant{}; variant.vt = VT_BLOB;
        variant.blob.cbSize = sizeof(parameters); variant.blob.pBlobData = reinterpret_cast<BYTE*>(&parameters);
        com_ptr<IActivateAudioInterfaceAsyncOperation> operation;
        check(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient),
            &variant, callback.get(), operation.put()));
        require(WaitForSingleObject(callback->done.value, 10000) == WAIT_OBJECT_0, L"App audio activation timed out.");
        check(callback->result); client = callback->client;
        WAVEFORMATEX format{WAVE_FORMAT_PCM, 2, 48000, 192000, 4, 16, 0};
        check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            2000000, 0, &format, nullptr));
        check(client->GetService(IID_PPV_ARGS(capture.put())));
    }
    ~AudioCapture() { if (client) client->Stop(); }
    void start() { check(client->Start()); }
    void read(Movie& movie, int64_t origin) {
        UINT32 available = 0; check(capture->GetNextPacketSize(&available));
        while (available) {
            BYTE* data = nullptr; UINT32 frames = 0; DWORD flags = 0; UINT64 deviceTime = 0, qpc = 0;
            check(capture->GetBuffer(&data, &frames, &flags, &deviceTime, &qpc));
            // Release the WASAPI buffer before encoding (which can block).
            std::vector<BYTE> copy;
            if (frames <= 48000 && !(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) copy.assign(data, data + frames * 4);
            check(capture->ReleaseBuffer(frames));
            require(frames <= 48000, L"Unexpected app audio packet size.");
            int64_t first = (flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR)
                ? static_cast<int64_t>(movie.audioFrames)
                : static_cast<int64_t>(std::llround((static_cast<int64_t>(qpc) - origin) * 48000.0 / 10000000));
            auto now = std::max<int64_t>(0, clockTime() - origin) * 48000 / 10000000;
            require(first <= now + 48000, L"Invalid app audio timestamp.");
            if (first > static_cast<int64_t>(movie.audioFrames)) movie.silenceUntil(first);
            auto skip = std::min<int64_t>(frames, std::max<int64_t>(0, static_cast<int64_t>(movie.audioFrames) - first));
            if (skip < frames) movie.audioSample(copy.empty() ? nullptr : copy.data() + skip * 4, frames - static_cast<UINT32>(skip));
            check(capture->GetNextPacketSize(&available));
        }
    }
};

struct ScreenCapture {
    Config config;
    UINT dpi;
    RECT crop{};
    com_ptr<ID3D11Device> device;
    com_ptr<ID3D11DeviceContext> context;
    com_ptr<ID3D11Texture2D> staging;
    GraphicsCaptureItem item{nullptr};
    Direct3D11CaptureFramePool pool{nullptr};
    GraphicsCaptureSession session{nullptr};
    winrt::Windows::Graphics::SizeInt32 size{};
    int64_t last = -10000000;
    std::vector<BYTE> previous;
    bool geometryChanged = false;
    explicit ScreenCapture(Config const& c) : config(c), dpi(GetDpiForWindow(c.window)) {
        require(GraphicsCaptureSession::IsSupported(), L"Windows Graphics Capture is unavailable.");
        check(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            nullptr, 0, D3D11_SDK_VERSION, device.put(), nullptr, context.put()));
        auto dxgi = device.as<IDXGIDevice>();
        com_ptr<::IInspectable> inspectable;
        check(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), inspectable.put()));
        auto direct = inspectable.as<IDirect3DDevice>();
        auto interop = get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
        check(interop->CreateForWindow(c.window, guid_of<GraphicsCaptureItem>(), put_abi(item)));
        size = item.Size();
        RECT frame{}, client{}, outer{}; POINT origin{};
        check(DwmGetWindowAttribute(c.window, DWMWA_EXTENDED_FRAME_BOUNDS, &frame, sizeof(frame)));
        require(GetClientRect(c.window, &client) && ClientToScreen(c.window, &origin) && GetWindowRect(c.window, &outer), L"Cannot locate game region.");
        // Electron's content origin can include a Views menu bar inside the
        // Win32 client area. Its offset is therefore supplied relative to the
        // outer window, then adjusted for DWM's invisible resize borders.
        crop.left = outer.left - frame.left + MulDiv(c.x, dpi, 96);
        crop.top = outer.top - frame.top + MulDiv(c.y, dpi, 96);
        crop.right = crop.left + MulDiv(c.width, dpi, 96);
        crop.bottom = crop.top + MulDiv(c.height, dpi, 96);
        std::cout << "{\"event\":\"diagnostic\",\"dpi\":" << dpi << ",\"captureWidth\":" << size.Width
            << ",\"captureHeight\":" << size.Height << ",\"cropX\":" << crop.left << ",\"cropY\":" << crop.top
            << ",\"cropWidth\":" << crop.right - crop.left << ",\"cropHeight\":" << crop.bottom - crop.top << "}" << std::endl;
        require(crop.right <= origin.x - frame.left + client.right && crop.bottom <= origin.y - frame.top + client.bottom
            && crop.left >= 0 && crop.top >= 0 && crop.right <= size.Width && crop.bottom <= size.Height,
            L"The entire game region must fit inside the window.");
        D3D11_TEXTURE2D_DESC desc{};
        desc.Width = crop.right - crop.left; desc.Height = crop.bottom - crop.top;
        desc.MipLevels = desc.ArraySize = 1; desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        desc.SampleDesc.Count = 1; desc.Usage = D3D11_USAGE_STAGING; desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        check(device->CreateTexture2D(&desc, nullptr, staging.put()));
        pool = Direct3D11CaptureFramePool::CreateFreeThreaded(direct, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, size);
        session = pool.CreateCaptureSession(item); session.IsCursorCaptureEnabled(false);
    }
    ~ScreenCapture() { if (session) session.Close(); if (pool) pool.Close(); }
    void start() { session.StartCapture(); }
    bool read(Movie& movie, int64_t origin) {
        if (!IsWindow(config.window) || IsIconic(config.window) || GetDpiForWindow(config.window) != dpi) {
            geometryChanged = true; return false;
        }
        int64_t time = clockTime() - origin;
        if (time - last < 10000000 / 30) return false;
        auto frame = pool.TryGetNextFrame();
        // Retain only the latest bounded frame; static windows need duplicate
        // samples so their video duration still follows the audio/stop time.
        if (frame) {
            while (auto next = pool.TryGetNextFrame()) frame = std::move(next);
        } else {
            if (previous.empty()) return false;
            movie.videoSample(previous, time); last = time; return true;
        }
        auto content = frame.ContentSize();
        if (content.Width != size.Width || content.Height != size.Height) {
            geometryChanged = true; return false;
        }
        auto surface = frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
        com_ptr<ID3D11Texture2D> texture;
        check(surface->GetInterface(IID_PPV_ARGS(texture.put())));
        D3D11_BOX box{static_cast<UINT>(crop.left), static_cast<UINT>(crop.top), 0,
            static_cast<UINT>(crop.right), static_cast<UINT>(crop.bottom), 1};
        context->CopySubresourceRegion(staging.get(), 0, 0, 0, 0, texture.get(), 0, &box);
        D3D11_MAPPED_SUBRESOURCE mapped{};
        check(context->Map(staging.get(), 0, D3D11_MAP_READ, 0, &mapped));
        // Bounded CPU BGRA -> NV12 conversion, including DPI downsampling. Output
        // always uses the game's logical size, independently of monitor scaling.
        int w = config.width, h = config.height;
        std::vector<BYTE> nv12(static_cast<size_t>(w) * h * 3 / 2);
        auto pixel = [&](int x, int y) {
            auto row = static_cast<BYTE const*>(mapped.pData) + (y * (crop.bottom - crop.top) / h) * mapped.RowPitch;
            return row + (x * (crop.right - crop.left) / w) * 4;
        };
        auto clamp = [](int n) { return static_cast<BYTE>(std::clamp(n, 0, 255)); };
        for (int y = 0; y < h; ++y) for (int x = 0; x < w; ++x) {
            auto p = pixel(x, y);
            nv12[y * w + x] = clamp(((66 * p[2] + 129 * p[1] + 25 * p[0] + 128) >> 8) + 16);
        }
        for (int y = 0; y < h; y += 2) for (int x = 0; x < w; x += 2) {
            int r = 0, g = 0, b = 0;
            for (int dy = 0; dy < 2; ++dy) for (int dx = 0; dx < 2; ++dx) {
                auto p = pixel(x + dx, y + dy); b += p[0]; g += p[1]; r += p[2];
            }
            r /= 4; g /= 4; b /= 4;
            size_t offset = static_cast<size_t>(w) * h + y / 2 * w + x;
            nv12[offset] = clamp(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128);
            nv12[offset + 1] = clamp(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128);
        }
        context->Unmap(staging.get(), 0);
        movie.videoSample(nv12, time); last = time; previous = std::move(nv12);
        return true;
    }
};

// Private stdin pipe from Electron. Polling the pipe keeps cancellation and EOF
// responsive without detached threads accessing destroyed recorder objects.
struct Commands {
    std::string pending;
    bool read(std::string& command) {
        HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
        DWORD available = 0;
        if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) { command = "discard"; return true; }
        if (!available) return false;
        char buffer[256]; DWORD count = 0;
        require(ReadFile(input, buffer, std::min<DWORD>(available, sizeof(buffer)), &count, nullptr) != FALSE, L"Cannot read recorder command.");
        pending.append(buffer, count);
        require(pending.size() < 1024, L"Invalid recorder command.");
        auto newline = pending.find('\n');
        if (newline == std::string::npos) return false;
        command = pending.substr(0, newline);
        if (!command.empty() && command.back() == '\r') command.pop_back();
        return true;
    }
};

void selfTest(std::wstring const& path) {
    Movie movie(path, 320, 240);
    std::vector<BYTE> frame(320 * 240 * 3 / 2, 128);
    for (int n = 0; n < 60; ++n) {
        std::fill(frame.begin(), frame.begin() + 320 * 240, static_cast<BYTE>(50 + n * 2));
        movie.videoSample(frame, n * 10000000LL / 30);
        std::vector<int16_t> pcm(1600 * 2);
        for (int i = 0; i < 1600; ++i) {
            auto value = static_cast<int16_t>(3000 * sin((n * 1600 + i) * 6.283185307179586 * 440 / 48000));
            pcm[i * 2] = pcm[i * 2 + 1] = value;
        }
        movie.audioSample(reinterpret_cast<BYTE const*>(pcm.data()), 1600);
    }
    movie.finish();
}
void verifyMovie(std::wstring const& path) {
    // Verification uses the Windows source reader and system decoders only.
    constexpr DWORD allStreams = static_cast<DWORD>(MF_SOURCE_READER_ALL_STREAMS);
    constexpr DWORD videoStream = static_cast<DWORD>(MF_SOURCE_READER_FIRST_VIDEO_STREAM);
    constexpr DWORD audioStream = static_cast<DWORD>(MF_SOURCE_READER_FIRST_AUDIO_STREAM);
    com_ptr<IMFSourceReader> reader;
    check(MFCreateSourceReaderFromURL(path.c_str(), nullptr, reader.put()));
    check(reader->SetStreamSelection(allStreams, FALSE));
    check(reader->SetStreamSelection(videoStream, TRUE));
    auto nv12 = mediaType(MFMediaType_Video, MFVideoFormat_NV12);
    check(reader->SetCurrentMediaType(videoStream, nullptr, nv12.get()));
    com_ptr<IMFMediaType> actual;
    check(reader->GetCurrentMediaType(videoStream, actual.put()));
    UINT32 width = 0, height = 0;
    check(MFGetAttributeSize(actual.get(), MF_MT_FRAME_SIZE, &width, &height));
    require(width == 320 && height == 240, L"Unexpected decoded video dimensions.");
    unsigned videoSamples = 0;
    int64_t videoEnd = 0;
    for (;;) {
        DWORD flags = 0; LONGLONG time = 0; com_ptr<IMFSample> value;
        check(reader->ReadSample(videoStream, 0, nullptr, &flags, &time, value.put()));
        if (value) {
            com_ptr<IMFMediaBuffer> buffer; check(value->ConvertToContiguousBuffer(buffer.put()));
            BYTE* bytes = nullptr; DWORD size = 0; check(buffer->Lock(&bytes, nullptr, &size));
            bool valid = size >= width * height && bytes[0] >= 30 && bytes[0] <= 190;
            check(buffer->Unlock()); require(valid, L"Decoded synthetic video is invalid.");
            ++videoSamples; videoEnd = time;
        }
        if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
    }
    require(videoSamples >= 58 && videoEnd > 19000000 && videoEnd < 21000000, L"Video duration/frame count is invalid.");
    reader = nullptr;
    check(MFCreateSourceReaderFromURL(path.c_str(), nullptr, reader.put()));
    check(reader->SetStreamSelection(allStreams, FALSE));
    check(reader->SetStreamSelection(audioStream, TRUE));
    auto pcm = mediaType(MFMediaType_Audio, MFAudioFormat_PCM); audioType(pcm.get(), false);
    check(reader->SetCurrentMediaType(audioStream, nullptr, pcm.get()));
    uint64_t decodedFrames = 0; int peak = 0;
    for (;;) {
        DWORD flags = 0; com_ptr<IMFSample> value;
        check(reader->ReadSample(audioStream, 0, nullptr, &flags, nullptr, value.put()));
        if (value) {
            com_ptr<IMFMediaBuffer> buffer; check(value->ConvertToContiguousBuffer(buffer.put()));
            BYTE* bytes = nullptr; DWORD size = 0; check(buffer->Lock(&bytes, nullptr, &size));
            auto samples = reinterpret_cast<int16_t const*>(bytes);
            for (DWORD i = 0; i < size / 2; ++i) peak = std::max(peak, abs(static_cast<int>(samples[i])));
            decodedFrames += size / 4;
            check(buffer->Unlock());
        }
        if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
    }
    require(decodedFrames >= 94000 && decodedFrames <= 99000 && peak > 1000, L"Decoded audio signal/duration is invalid.");
    std::cout << "{\"event\":\"verified\",\"videoFrames\":" << videoSamples
        << ",\"audioFrames\":" << decodedFrames << ",\"audioPeak\":" << peak << "}" << std::endl;
}
int wmain(int argc, wchar_t** argv) {
    bool mfStarted = false;
    try {
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        init_apartment(apartment_type::multi_threaded);
        check(MFStartup(MF_VERSION)); mfStarted = true;
        if (argc == 3 && std::wstring(argv[1]) == L"--self-test") selfTest(argv[2]);
        else if (argc == 3 && std::wstring(argv[1]) == L"--verify") verifyMovie(argv[2]);
        else {
            auto config = Config::read();
            Movie movie(config.path, config.width, config.height);
            AudioCapture audio(config.pid); ScreenCapture screen(config);
            int64_t origin = clockTime(); audio.start(); screen.start();
            Commands commands; std::string command;
            int64_t lastVideo = origin;
            bool ready = false;
            for (;;) {
                if (commands.read(command)) break;
                audio.read(movie, origin);
                auto now = clockTime();
                // A stopped/silent renderer still yields a valid silent AAC track.
                movie.silenceUntil(static_cast<uint64_t>(std::max<int64_t>(0, now - origin - 1000000)) * 48000 / 10000000);
                if (screen.read(movie, origin)) {
                    lastVideo = now;
                    if (!ready) { report("ready"); ready = true; }
                }
                if (screen.geometryChanged) { command = "stop"; break; }
                require(now - lastVideo < 100000000, L"No window frames received for 10 seconds.");
                Sleep(5);
            }
            if (command == "stop") {
                audio.read(movie, origin);
                movie.silenceUntil(static_cast<uint64_t>(std::max<int64_t>(0, clockTime() - origin)) * 48000 / 10000000);
                movie.finish();
            }
        }
        MFShutdown(); return 0;
    } catch (hresult_error const& error) {
        wchar_t code[32]; swprintf_s(code, L" (HRESULT 0x%08X)", static_cast<unsigned>(error.code().value));
        report("error", std::wstring(error.message().c_str()) + code);
    } catch (std::exception const& error) { report("error", to_hstring(error.what()).c_str()); }
    if (mfStarted) MFShutdown();
    return 1;
}
