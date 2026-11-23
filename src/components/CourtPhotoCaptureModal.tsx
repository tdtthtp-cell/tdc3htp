import React, { useState, useRef, useEffect } from 'react';

interface CourtPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (photo: {
    imageUrl: string;
    title: string;
    caption: string;
    source: 'droidcam' | 'device';
  }) => void;
  lessonTitle: string;
  sportName: string;
  schoolLocation?: string;
}

export const CourtPhotoCaptureModal: React.FC<CourtPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
  lessonTitle,
  sportName,
  schoolLocation = 'xã Châu Hưng'
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'mobile-camera' | 'droidcam-guide' | 'upload'>('camera');
  
  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [photoTitle, setPhotoTitle] = useState<string>('');
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [addWatermark, setAddWatermark] = useState<boolean>(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // DroidCam IP state
  const [droidCamIp, setDroidCamIp] = useState<string>('192.168.1.15');
  const [droidCamPort, setDroidCamPort] = useState<string>('4747');

  // Upload state
  const [uploadedFilesPreview, setUploadedFilesPreview] = useState<Array<{
    url: string;
    title: string;
    caption: string;
  }>>([]);

  // Khởi tạo tên và chú thích mặc định theo bài học
  useEffect(() => {
    if (isOpen) {
      setPhotoTitle(`Ảnh thực tế: ${lessonTitle} - Môn ${sportName}`);
      setPhotoCaption(`Ảnh chụp thực tế học sinh THPT Huỳnh Tấn Phát (${schoolLocation}) thực hành kỹ thuật ${lessonTitle} trên sân tập.`);
      setCapturedPreview(null);
      setCameraError('');
      setUploadedFilesPreview([]);
      // Thử tự động bật camera khi mở modal
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Ngắt camera khi chuyển sang tab khác
  useEffect(() => {
    if (activeTab !== 'camera') {
      stopCamera();
    } else if (isOpen && !isCameraActive && !cameraError) {
      startCamera();
    }
  }, [activeTab]);

  // Lắng nghe sự kiện Paste (Ctrl+V) ảnh từ clipboard
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                applyWatermarkToImage(event.target.result as string);
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, addWatermark, lessonTitle, sportName, schoolLocation]);

  // Hàm quét danh sách thiết bị camera (sau khi đã được cấp quyền)
  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoInputs);

      // Nếu có thiết bị mang tên DroidCam thì tự động ưu tiên
      const droidCam = videoInputs.find(d => 
        d.label.toLowerCase().includes('droidcam') || 
        d.label.toLowerCase().includes('vcam') ||
        d.label.toLowerCase().includes('source')
      );
      if (droidCam && !selectedDeviceId) {
        setSelectedDeviceId(droidCam.deviceId);
      }
    } catch (err) {
      console.warn('Lỗi quét thiết bị:', err);
    }
  };

  // Khởi động Camera linh hoạt (Progressive Fallback)
  const startCamera = async (overrideDeviceId?: string) => {
    stopCamera();
    setCameraError('');
    setIsStartingCamera(true);

    const targetDeviceId = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Trình duyệt hoặc môi trường hiện tại chưa cho phép truy cập Camera trực tiếp. Thầy/Cô vui lòng dùng nút "Chụp Bằng Camera Điện Thoại" hoặc "Chọn Ảnh Từ Thiết Bị" bên dưới.'
        );
        setIsStartingCamera(false);
        return;
      }

      let stream: MediaStream | null = null;

      // Lần thử 1: Thử với deviceId nếu đã chọn, hoặc facingMode
      try {
        const constraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? { deviceId: { ideal: targetDeviceId } }
            : { facingMode: { ideal: facingMode } },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('Lần thử 1 với ràng buộc cụ thể thất bại, thử chế độ tương thích rộng { video: true }...', firstErr);
        // Lần thử 2: Chế độ tương thích rộng nhất, không ép độ phân giải hay thiết bị
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      if (stream) {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.warn('Play error:', e));
            setIsCameraActive(true);
            setIsStartingCamera(false);
          };
        }

        // Sau khi đã có stream (đã cấp quyền), quét đầy đủ danh sách thiết bị
        await refreshDevices();
      }
    } catch (err: any) {
      console.warn('Lỗi mở camera:', err);
      setIsStartingCamera(false);
      setIsCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError(
          'Quyền truy cập Camera bị từ chối trong trình duyệt. Thầy/Cô hãy bấm vào biểu tượng Ổ khóa / Camera trên thanh địa chỉ của trình duyệt, chọn "Cho phép (Allow)" rồi bấm "Thử lại", hoặc chuyển sang tab "Chụp Bằng Camera Điện Thoại".'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError(
          'Không tìm thấy camera hoặc webcam kết nối. Nếu dùng DroidCam, Thầy/Cô cần mở DroidCam Client trên máy tính và bấm "Start" trước khi mở trang web.'
        );
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError(
          'Camera đang bị một ứng dụng khác (Zoom, Teams, Zalo, ứng dụng camera máy) sử dụng. Thầy/Cô vui lòng tắt các ứng dụng đó rồi bấm "Thử lại".'
        );
      } else {
        setCameraError(
          `Không thể kích hoạt camera: ${err.message || 'Lỗi thiết bị'}. Thầy/Cô có thể dùng tính năng "Chụp Bằng Camera Điện Thoại" hoặc "Chọn Ảnh Từ Thiết Bị".`
        );
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsStartingCamera(false);
  };

  // Đóng dấu bản quyền sư phạm lên ảnh
  const applyWatermarkToImage = (sourceDataUrl: string) => {
    if (!addWatermark) {
      setCapturedPreview(sourceDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 1280;
      canvas.height = img.height || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setCapturedPreview(sourceDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);

      const bannerH = Math.max(52, Math.round(canvas.height * 0.085));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, canvas.height - bannerH, canvas.width, bannerH);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - bannerH);
      ctx.lineTo(canvas.width, canvas.height - bannerH);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = `bold ${Math.max(13, Math.round(bannerH * 0.32))}px sans-serif`;
      ctx.fillText(
        `TRƯỜNG THPT HUỲNH TẤN PHÁT • BỘ MÔN GIÁO DỤC THỂ CHẤT (${schoolLocation.toUpperCase()})`,
        24,
        canvas.height - bannerH + bannerH * 0.42
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(11, Math.round(bannerH * 0.26))}px sans-serif`;
      ctx.fillText(
        `Bài dạy: ${lessonTitle} • Môn ${sportName} • Ngày chụp: ${new Date().toLocaleDateString('vi-VN')}`,
        24,
        canvas.height - bannerH + bannerH * 0.8
      );

      setCapturedPreview(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = sourceDataUrl;
  };

  // Chụp ảnh snapshot từ video trực tiếp
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, vw, vh);

    if (addWatermark) {
      const bannerH = Math.max(52, Math.round(vh * 0.085));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, vh - bannerH, vw, bannerH);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, vh - bannerH);
      ctx.lineTo(vw, vh - bannerH);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = `bold ${Math.max(13, Math.round(bannerH * 0.32))}px sans-serif`;
      ctx.fillText(
        `TRƯỜNG THPT HUỲNH TẤN PHÁT • BỘ MÔN GIÁO DỤC THỂ CHẤT (${schoolLocation.toUpperCase()})`,
        24,
        vh - bannerH + bannerH * 0.42
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(11, Math.round(bannerH * 0.26))}px sans-serif`;
      ctx.fillText(
        `Bài dạy: ${lessonTitle} • Môn ${sportName} • Ngày chụp: ${new Date().toLocaleDateString('vi-VN')}`,
        24,
        vh - bannerH + bannerH * 0.8
      );
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedPreview(dataUrl);
  };

  // Chụp trực tiếp từ Camera điện thoại qua HTML5 Native Capture
  const handleNativeMobileCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        applyWatermarkToImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Lưu ảnh vừa chụp vào Kế hoạch bài dạy
  const handleSaveCapturedPhoto = () => {
    if (!capturedPreview) return;
    onPhotoCaptured({
      imageUrl: capturedPreview,
      title: photoTitle.trim() || `Ảnh thực tế: ${lessonTitle}`,
      caption: photoCaption.trim() || `Ảnh chụp thực tế trên sân tập môn ${sportName} trường THPT Huỳnh Tấn Phát.`,
      source: 'droidcam'
    });
    setCapturedPreview(null);
    onClose();
  };

  // Xử lý chọn nhiều tệp ảnh từ máy tính/điện thoại
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const url = event.target.result as string;
          setUploadedFilesPreview(prev => [
            ...prev,
            {
              url,
              title: `Ảnh ${prev.length + index + 1}: ${lessonTitle}`,
              caption: `Ảnh chụp thực tế học sinh THPT Huỳnh Tấn Phát (${schoolLocation}) thực hành trên sân tập.`
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Lưu tất cả ảnh đã tải lên
  const handleSaveAllUploaded = () => {
    uploadedFilesPreview.forEach((p) => {
      onPhotoCaptured({
        imageUrl: p.url,
        title: p.title,
        caption: p.caption,
        source: 'device'
      });
    });
    setUploadedFilesPreview([]);
    onClose();
  };

  if (!isOpen) return null;

  const droidCamMjpegUrl = `http://${droidCamIp.trim()}:${droidCamPort.trim()}/mjpegfeed`;
  const droidCamBrowserUrl = `http://${droidCamIp.trim()}:${droidCamPort.trim()}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-2xl text-white my-auto animate-fade-in">
        
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shrink-0">
              <i className="fa-solid fa-camera text-lg"></i>
            </span>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-emerald-300">
                Chụp Ảnh Sân Tập & Đính Kèm Ảnh Minh Họa Bài Dạy
              </h2>
              <p className="text-xs text-slate-400">
                Hỗ trợ <strong>DroidCam Webcam</strong> • <strong>Camera Điện Thoại</strong> • <strong>Tải ảnh từ máy</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Đóng cửa sổ"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* 4 TAB ĐIỀU KHIỂN RÕ RÀNG */}
        <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => { setActiveTab('camera'); setCapturedPreview(null); }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'camera'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-video text-amber-400"></i>
            <span>1. Camera Trực Tiếp & DroidCam PC</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('mobile-camera'); setCapturedPreview(null); }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'mobile-camera'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-mobile-screen text-sky-400"></i>
            <span>2. Chụp Bằng Camera Điện Thoại</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('droidcam-guide'); setCapturedPreview(null); }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'droidcam-guide'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-circle-question text-teal-400"></i>
            <span>3. Hướng Dẫn Kết Nối DroidCam</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('upload'); setCapturedPreview(null); }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'upload'
                ? 'bg-emerald-700 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-folder-open text-purple-400"></i>
            <span>4. Chọn Ảnh Trên Thiết Bị</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: CAMERA TRỰC TIẾP / DROIDCAM CLIENT WEBCAM          */}
        {/* ========================================================= */}
        {activeTab === 'camera' && (
          <div className="space-y-3.5">
            {/* Thanh chọn thiết bị và tùy chỉnh */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <label className="font-semibold text-slate-300 shrink-0 flex items-center gap-1">
                  <i className="fa-solid fa-camera text-emerald-400"></i>
                  <span>Nguồn Camera:</span>
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedDeviceId(id);
                    startCamera(id);
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-emerald-500 flex-1 min-w-[200px] max-w-sm"
                >
                  {cameraDevices.length === 0 ? (
                    <option value="">{isStartingCamera ? 'Đang kích hoạt camera...' : 'Camera mặc định thiết bị'}</option>
                  ) : (
                    cameraDevices.map((d, i) => {
                      const isDroidCam = d.label.toLowerCase().includes('droidcam') || d.label.toLowerCase().includes('vcam');
                      return (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`} {isDroidCam ? '★ [DroidCam Kết Nối]' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="p-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg cursor-pointer flex items-center gap-1"
                  title="Làm mới và kết nối lại camera"
                >
                  <i className="fa-solid fa-rotate"></i>
                  <span>Làm mới</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const newMode = facingMode === 'environment' ? 'user' : 'environment';
                    setFacingMode(newMode);
                    setSelectedDeviceId('');
                    startCamera();
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Chuyển camera trước / sau (trên điện thoại/tablet)"
                >
                  <i className="fa-solid fa-camera-rotate text-amber-400"></i>
                  <span>Đổi Cam Trước/Sau</span>
                </button>
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addWatermark}
                    onChange={(e) => setAddWatermark(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span>Đóng dấu THPT Huỳnh Tấn Phát</span>
                </label>
              </div>
            </div>

            {/* Khung hình Live Video hoặc Ảnh đã chụp */}
            {!capturedPreview ? (
              <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                />

                {/* Vạch căn góc thể thao (Sports Framing Grid) khi camera đang chạy */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-25">
                    <div className="border-r border-b border-white"></div>
                    <div className="border-r border-b border-white"></div>
                    <div className="border-b border-white"></div>
                    <div className="border-r border-b border-white"></div>
                    <div className="border-r border-b border-white"></div>
                    <div className="border-b border-white"></div>
                    <div className="border-r border-white"></div>
                    <div className="border-r border-white"></div>
                    <div></div>
                  </div>
                )}

                {/* Huy hiệu DroidCam trạng thái */}
                {isCameraActive && (
                  <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 shadow-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Camera Trực Tiếp 60 FPS</span>
                  </div>
                )}

                {/* Nút chụp ảnh lớn nổi bật */}
                {isCameraActive && (
                  <div className="absolute bottom-4 inset-x-0 flex justify-center items-center gap-3 pointer-events-auto">
                    <button
                      type="button"
                      onClick={handleCaptureSnapshot}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-full shadow-2xl flex items-center gap-2 cursor-pointer transition transform active:scale-95 border-2 border-white/50"
                    >
                      <i className="fa-solid fa-camera-retro text-lg text-amber-300"></i>
                      <span className="text-sm uppercase tracking-wide">Chụp Ảnh Khoảnh Khắc Ngay</span>
                    </button>
                  </div>
                )}

                {/* Trạng thái đang tải / khởi động camera */}
                {isStartingCamera && !cameraError && (
                  <div className="flex flex-col items-center justify-center p-6 space-y-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-400"></i>
                    <p className="text-xs text-slate-300 font-medium">Đang kết nối camera và nhận diện nguồn DroidCam...</p>
                  </div>
                )}

                {/* Giao diện khi Camera chưa chạy hoặc bị lỗi */}
                {!isCameraActive && !isStartingCamera && (
                  <div className="p-6 text-center space-y-3 max-w-md">
                    <div className="w-14 h-14 mx-auto rounded-full bg-slate-800 text-amber-400 flex items-center justify-center text-2xl border border-slate-700">
                      <i className="fa-solid fa-video-slash"></i>
                    </div>

                    {cameraError ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-rose-300 font-semibold leading-relaxed">{cameraError}</p>
                        <p className="text-[11px] text-slate-400">
                          Thầy/Cô có thể bấm <strong>"Bật Lại Camera"</strong> hoặc chuyển sang tab <strong>"Chụp Bằng Camera Điện Thoại"</strong> bên cạnh.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-200">Camera chưa được kích hoạt</p>
                        <p className="text-[11px] text-slate-400">
                          Bấm nút bên dưới để cấp quyền mở Camera thiết bị hoặc nhận luồng từ DroidCam PC Client.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <i className="fa-solid fa-play text-amber-300"></i>
                        <span>Bật / Kết Nối Lại Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('mobile-camera')}
                        className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <i className="fa-solid fa-mobile-screen"></i>
                        <span>Dùng Camera Điện Thoại</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Xem lại ảnh đã chụp và điền thông tin */
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-emerald-500/50 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-check"></i>
                    <span>Đã chụp ảnh khoảnh khắc thành công! Xem lại và thêm vào KHBD:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCapturedPreview(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
                  >
                    <i className="fa-solid fa-arrow-rotate-left mr-1"></i>
                    Chụp lại
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-5 rounded-lg overflow-hidden border border-slate-800">
                    <img src={capturedPreview} alt="Ảnh chụp" className="w-full h-44 object-contain bg-black" />
                  </div>

                  <div className="md:col-span-7 space-y-2.5 text-xs">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Tiêu đề ảnh minh họa:</label>
                      <input
                        type="text"
                        value={photoTitle}
                        onChange={(e) => setPhotoTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                        placeholder="Nhập tiêu đề ảnh minh họa..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Chú thích sư phạm:</label>
                      <textarea
                        rows={2}
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                        placeholder="Nhập hướng dẫn hoặc tư thế kỹ thuật..."
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveCapturedPhoto}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Thêm Vào Kế Hoạch Bài Dạy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapturedPreview(null)}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CHỤP TRỰC TIẾP BẰNG CAMERA ĐIỆN THOẠI (NATIVE HTML5) */}
        {/* ========================================================= */}
        {activeTab === 'mobile-camera' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-sky-500/60 rounded-2xl p-6 text-center space-y-3 bg-slate-950/70">
              <div className="w-14 h-14 mx-auto rounded-full bg-sky-950/80 border border-sky-500/50 flex items-center justify-center text-sky-400 text-2xl">
                <i className="fa-solid fa-mobile-screen-button"></i>
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-100">
                  Chụp Bằng Camera Điện Thoại Hoặc Tablet Trực Tiếp Trên Sân
                </h3>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Phương thức chụp trực tiếp bằng ứng dụng máy ảnh gốc của điện thoại: <strong>Độ nét tối đa (Full HD / 4K)</strong>, có lấy nét tự động, tự động đóng dấu trường THPT Huỳnh Tấn Phát và đưa ngay vào giáo án mà không lo lỗi kết nối!
                </p>
              </div>

              <div className="pt-2">
                <label className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold rounded-xl cursor-pointer text-sm shadow-xl transition transform active:scale-95 border border-sky-300/40">
                  <i className="fa-solid fa-camera text-amber-300 text-lg"></i>
                  <span>Mở Camera Điện Thoại Chụp Ngay</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleNativeMobileCamera}
                    className="hidden"
                  />
                </label>
              </div>

              <p className="text-[11px] text-slate-400 italic">
                * Mẹo: Thầy/Cô mở trang web trên điện thoại hoặc máy tính bảng khi đang ở trên sân để chụp động tác học sinh nhanh nhất.
              </p>
            </div>

            {/* Xem lại ảnh vừa chụp từ điện thoại */}
            {capturedPreview && (
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-sky-500/50 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-check"></i>
                    <span>Đã nhận ảnh từ Camera điện thoại!</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCapturedPreview(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
                  >
                    Hủy ảnh này
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-5 rounded-lg overflow-hidden border border-slate-800">
                    <img src={capturedPreview} alt="Ảnh điện thoại" className="w-full h-44 object-contain bg-black" />
                  </div>

                  <div className="md:col-span-7 space-y-2.5 text-xs">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Tiêu đề ảnh minh họa:</label>
                      <input
                        type="text"
                        value={photoTitle}
                        onChange={(e) => setPhotoTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Chú thích sư phạm:</label>
                      <textarea
                        rows={2}
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveCapturedPhoto}
                        className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Thêm Vào Kế Hoạch Bài Dạy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: HƯỚNG DẪN KẾT NỐI DROIDCAM CHUẨN XÁC                */}
        {/* ========================================================= */}
        {activeTab === 'droidcam-guide' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3.5 text-xs">
              
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-slate-800 pb-2">
                <i className="fa-solid fa-circle-info"></i>
                <span>Cách Kết Nối DroidCam Với Máy Tính Chuẩn Nhất (Không Bị Chặn):</span>
              </div>

              {/* 3 BƯỚC DROIDCAM CLIENT */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">1</span>
                    <span>Cài Đặt DroidCam</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Cài ứng dụng <strong>DroidCam</strong> trên điện thoại (CH Play / App Store) và phần mềm <strong>DroidCam Client</strong> trên máy tính từ trang chủ <code>dev47apps.com</code>.
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">2</span>
                    <span>Bấm Start Trên PC</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Kết nối điện thoại với máy tính qua <strong>Cáp USB</strong> (ổn định nhất) hoặc chung WiFi, nhập IP điện thoại vào phần mềm máy tính rồi bấm <strong>Start</strong>.
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">3</span>
                    <span>Chọn Nguồn Trên Web</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Quay lại Tab <strong>"1. Camera Trực Tiếp"</strong>, trong mục Chọn nguồn Camera Thầy/Cô sẽ thấy <strong>"DroidCam Source 1"</strong>, chọn nó là video sẽ hiển thị ngay!
                  </p>
                </div>
              </div>

              {/* TRƯỜNG HỢP XEM QUA ĐỊA CHỈ IP WIFI */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-sky-400">Xem luồng DroidCam IP trên trình duyệt:</h4>
                    <p className="text-slate-400 text-[11px]">
                      Do quy chuẩn bảo mật quốc tế HTTPS, trình duyệt sẽ chặn nhúng trực tiếp HTTP nội bộ vào trang web. Thầy/Cô hãy bấm nút mở tab mới bên dưới để xem trực tiếp:
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">IP:</span>
                    <input
                      type="text"
                      value={droidCamIp}
                      onChange={(e) => setDroidCamIp(e.target.value)}
                      placeholder="192.168.1.15"
                      className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-white font-mono text-xs w-32"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Port:</span>
                    <input
                      type="text"
                      value={droidCamPort}
                      onChange={(e) => setDroidCamPort(e.target.value)}
                      placeholder="4747"
                      className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-white font-mono text-xs w-16"
                    />
                  </div>

                  <a
                    href={droidCamBrowserUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square"></i>
                    <span>Mở Luồng DroidCam Tab Mới ({droidCamIp}:{droidCamPort})</span>
                  </a>
                </div>

                <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-emerald-200 text-xs flex items-center gap-2">
                  <i className="fa-solid fa-paste text-amber-400 text-base shrink-0"></i>
                  <span>
                    <strong>Mẹo siêu nhanh:</strong> Khi xem camera trên tab DroidCam, Thầy/Cô chỉ cần chụp màn hình (phím <code>Win + Shift + S</code>), sau đó quay lại cửa sổ này bấm <strong>Ctrl + V</strong> là ảnh lập tức được tự động đóng dấu và đính kèm vào giáo án!
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: CHỌN ẢNH CÓ SẴN TRÊN THIẾT BỊ                      */}
        {/* ========================================================= */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-emerald-500/60 rounded-2xl p-6 text-center space-y-3 bg-slate-950/70 hover:bg-slate-950 transition">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-xl">
                <i className="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-200">
                  Chọn ảnh chụp học sinh, sân bãi hoặc dụng cụ từ thiết bị
                </h3>
                <p className="text-xs text-slate-400">
                  Hỗ trợ JPG, PNG, WEBP • Chọn cùng lúc nhiều ảnh thực tế tại THPT Huỳnh Tấn Phát
                </p>
              </div>

              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-xl cursor-pointer text-xs shadow-lg transition">
                <i className="fa-solid fa-folder-open"></i>
                <span>Duyệt Ảnh Từ Thiết Bị...</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Danh sách ảnh đã chọn để xem trước và lưu */}
            {uploadedFilesPreview.length > 0 && (
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-400">
                    Đã chọn {uploadedFilesPreview.length} hình ảnh từ thiết bị:
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadedFilesPreview([])}
                    className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Xóa tất cả
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
                  {uploadedFilesPreview.map((item, idx) => (
                    <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-2">
                      <img src={item.url} alt={`Ảnh ${idx + 1}`} className="w-full h-32 object-contain bg-black rounded" />
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUploadedFilesPreview(prev => prev.map((p, i) => i === idx ? { ...p, title: val } : p));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                        placeholder="Tiêu đề ảnh..."
                      />
                      <textarea
                        rows={1}
                        value={item.caption}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUploadedFilesPreview(prev => prev.map((p, i) => i === idx ? { ...p, caption: val } : p));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                        placeholder="Chú thích..."
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAllUploaded}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow-md"
                  >
                    Lưu {uploadedFilesPreview.length} Ảnh Vào Kế Hoạch Bài Dạy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
