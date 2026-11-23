import React, { useState, useRef, useEffect } from 'react';

export interface CameraDeviceDiagnostic {
  isReady: boolean;
  isChecking: boolean;
  deviceCount: number;
  activeDeviceName: string;
  activeDeviceId: string;
  resolution: string;
  frameRate: string;
  isLaptopBuiltIn: boolean;
  isDroidCam: boolean;
  message: string;
  checkedAt: string;
}

interface CourtPhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (photo: {
    imageUrl: string;
    title: string;
    caption: string;
    source: 'droidcam' | 'device' | 'laptop-webcam';
  }) => void;
  lessonTitle: string;
  sportName: string;
  schoolLocation?: string;
  initialMode?: 'laptop-webcam' | 'droidcam' | 'mobile-camera' | 'upload';
  onDeviceStatusChange?: (diagnostic: CameraDeviceDiagnostic) => void;
}

export const CourtPhotoCaptureModal: React.FC<CourtPhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
  lessonTitle,
  sportName,
  schoolLocation = 'xã Châu Hưng',
  initialMode = 'laptop-webcam',
  onDeviceStatusChange
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'mobile-camera' | 'droidcam-guide' | 'upload'>('camera');
  const [preferredSourceMode, setPreferredSourceMode] = useState<'laptop-webcam' | 'droidcam'>('laptop-webcam');

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
  const [mirrorVideo, setMirrorVideo] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [activeCountdown, setActiveCountdown] = useState<number | null>(null);

  // Device diagnostic & readiness notification state
  const [diagnosticInfo, setDiagnosticInfo] = useState<CameraDeviceDiagnostic>({
    isReady: false,
    isChecking: false,
    deviceCount: 0,
    activeDeviceName: '',
    activeDeviceId: '',
    resolution: '',
    frameRate: '',
    isLaptopBuiltIn: true,
    isDroidCam: false,
    message: 'Đang chờ kiểm tra thiết bị chụp ảnh...',
    checkedAt: ''
  });
  const [readyToastMessage, setReadyToastMessage] = useState<string>('');

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

      if (initialMode === 'mobile-camera') {
        setActiveTab('mobile-camera');
      } else if (initialMode === 'upload') {
        setActiveTab('upload');
      } else {
        setActiveTab('camera');
        const mode = initialMode === 'droidcam' ? 'droidcam' : 'laptop-webcam';
        setPreferredSourceMode(mode);
        startCamera(undefined, mode, true);
      }
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, initialMode]);

  // Ngắt camera khi chuyển sang tab khác
  useEffect(() => {
    if (activeTab !== 'camera') {
      stopCamera();
    } else if (isOpen && !isCameraActive && !isStartingCamera && !cameraError) {
      startCamera(undefined, preferredSourceMode, false);
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

  // Phân loại thiết bị camera là Camera Laptop tích hợp hay DroidCam
  const checkIsDroidCamLabel = (label: string) => {
    const l = label.toLowerCase();
    return l.includes('droidcam') || l.includes('vcam') || l.includes('obs');
  };

  // Khởi động Camera Laptop / Webcam & Kiểm tra thiết bị chụp ảnh
  const startCamera = async (
    overrideDeviceId?: string,
    mode: 'laptop-webcam' | 'droidcam' = preferredSourceMode,
    showReadyNotification: boolean = true
  ) => {
    stopCamera();
    setCameraError('');
    setIsStartingCamera(true);
    setDiagnosticInfo(prev => ({
      ...prev,
      isChecking: true,
      isReady: false,
      message: 'Đang kiểm tra phần cứng camera trên laptop và kết nối thiết bị chụp ảnh...'
    }));

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg = 'Trình duyệt hiện tại chưa hỗ trợ hoặc chưa cấp quyền WebRTC Camera. Thầy/Cô vui lòng mở bằng Chrome/Edge trên Laptop hoặc chọn ảnh từ thiết bị.';
        setCameraError(msg);
        setIsStartingCamera(false);
        const failDiag: CameraDeviceDiagnostic = {
          isReady: false,
          isChecking: false,
          deviceCount: 0,
          activeDeviceName: 'Chưa nhận diện được Camera',
          activeDeviceId: '',
          resolution: 'N/A',
          frameRate: 'N/A',
          isLaptopBuiltIn: false,
          isDroidCam: false,
          message: msg,
          checkedAt: new Date().toLocaleTimeString('vi-VN')
        };
        setDiagnosticInfo(failDiag);
        onDeviceStatusChange?.(failDiag);
        return;
      }

      // Bước 1: Quét danh sách thiết bị ban đầu (nếu đã có quyền từ trước)
      let initialDevices: MediaDeviceInfo[] = [];
      if (navigator.mediaDevices.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        initialDevices = all.filter(d => d.kind === 'videoinput');
      }

      let targetDeviceId = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;

      // Nếu người dùng chưa chỉ định deviceId cụ thể, tự động ưu tiên Camera Laptop hoặc DroidCam theo chế độ
      if (!targetDeviceId && initialDevices.length > 0) {
        if (mode === 'laptop-webcam') {
          const laptopCam = initialDevices.find(d => d.label && !checkIsDroidCamLabel(d.label));
          if (laptopCam?.deviceId) {
            targetDeviceId = laptopCam.deviceId;
          }
        } else if (mode === 'droidcam') {
          const droidCam = initialDevices.find(d => d.label && checkIsDroidCamLabel(d.label));
          if (droidCam?.deviceId) {
            targetDeviceId = droidCam.deviceId;
          }
        }
      }

      let stream: MediaStream | null = null;

      // Lần thử 1: Độ phân giải HD chuẩn cho Camera Laptop (1280x720) kèm deviceId (nếu có)
      try {
        const videoConstraints: MediaTrackConstraints = targetDeviceId
          ? {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: { ideal: 'user' }
            };
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
      } catch (firstErr) {
        console.warn('Lần thử 1 (HD / Exact Device) chưa khớp, chuyển sang Lần thử 2 linh hoạt cho Webcam Laptop...', firstErr);
        try {
          // Lần thử 2: Dùng ideal deviceId không ép độ phân giải
          stream = await navigator.mediaDevices.getUserMedia({
            video: targetDeviceId ? { deviceId: { ideal: targetDeviceId } } : true,
            audio: false
          });
        } catch (secondErr) {
          console.warn('Lần thử 2 chưa khớp, chuyển sang Lần thử 3 tương thích mọi Webcam Laptop { video: true }...', secondErr);
          // Lần thử 3: Chế độ tương thích tuyệt đối cho mọi dòng Laptop
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      if (stream) {
        streamRef.current = stream;

        // Lấy thông số kỹ thuật thực tế từ video track trên Laptop
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings ? videoTrack.getSettings() : {};
        const trackLabel = videoTrack?.label || 'Camera Laptop (Integrated Webcam)';

        // Sau khi đã cấp quyền stream, quét lại toàn bộ danh sách thiết bị để hiển thị đầy đủ tên camera
        let videoInputs: MediaDeviceInfo[] = [];
        if (navigator.mediaDevices.enumerateDevices) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          videoInputs = allDevices.filter(d => d.kind === 'videoinput');
          setCameraDevices(videoInputs);
        }

        const activeId = settings.deviceId || targetDeviceId || (videoInputs[0]?.deviceId ?? '');
        if (activeId) {
          setSelectedDeviceId(activeId);
        }

        const isDroid = checkIsDroidCamLabel(trackLabel);
        if (isDroid) {
          setPreferredSourceMode('droidcam');
        } else {
          setPreferredSourceMode('laptop-webcam');
        }

        const applyDiagnostics = (vw?: number, vh?: number) => {
          const width = vw || settings.width || 1280;
          const height = vh || settings.height || 720;
          const fps = settings.frameRate ? `${Math.round(settings.frameRate)} FPS` : '30-60 FPS';
          const resText = `${width} × ${height} px (${height >= 720 ? 'HD / Full HD' : 'Chuẩn'})`;
          const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const readyMsg = `Thiết bị chụp ảnh đã sẵn sàng! Đã kết nối "${trackLabel}" (${resText}).`;

          const diag: CameraDeviceDiagnostic = {
            isReady: true,
            isChecking: false,
            deviceCount: Math.max(1, videoInputs.length),
            activeDeviceName: trackLabel,
            activeDeviceId: activeId,
            resolution: resText,
            frameRate: fps,
            isLaptopBuiltIn: !isDroid,
            isDroidCam: isDroid,
            message: readyMsg,
            checkedAt: timeStr
          };

          setDiagnosticInfo(diag);
          onDeviceStatusChange?.(diag);

          if (showReadyNotification) {
            setReadyToastMessage(readyMsg);
          }
        };

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.warn('Play error:', e));
            setIsCameraActive(true);
            setIsStartingCamera(false);
            applyDiagnostics(videoRef.current?.videoWidth, videoRef.current?.videoHeight);
          };
        } else {
          setIsCameraActive(true);
          setIsStartingCamera(false);
          applyDiagnostics();
        }
      }
    } catch (err: any) {
      console.warn('Lỗi mở camera:', err);
      setIsStartingCamera(false);
      setIsCameraActive(false);

      let errMsg = '';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Quyền truy cập Camera trên Laptop đang bị chặn. Thầy/Cô hãy bấm vào biểu tượng Ổ khóa / Camera trên thanh địa chỉ trình duyệt, chọn "Cho phép (Allow)" rồi bấm "Kiểm Tra Thiết Bị Chụp Ảnh".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'Không tìm thấy phần cứng Camera/Webcam trên Laptop. Thầy/Cô vui lòng kiểm tra phím tắt bật Webcam trên bàn phím Laptop (Fn + F6/F8/F10) hoặc kết nối Webcam USB / DroidCam.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errMsg = 'Camera Laptop đang được sử dụng bởi ứng dụng khác (Zoom, Google Meet, Zalo, Camera Windows). Thầy/Cô vui lòng đóng ứng dụng đó rồi bấm "Kiểm Tra Lại Thiết Bị".';
      } else {
        errMsg = `Không thể kết nối Camera Laptop: ${err.message || 'Lỗi phần cứng'}. Thầy/Cô hãy bấm "Kiểm Tra Thiết Bị Chụp Ảnh" để thử lại.`;
      }

      setCameraError(errMsg);
      const failDiag: CameraDeviceDiagnostic = {
        isReady: false,
        isChecking: false,
        deviceCount: cameraDevices.length,
        activeDeviceName: 'Chưa kết nối được Camera',
        activeDeviceId: '',
        resolution: 'N/A',
        frameRate: 'N/A',
        isLaptopBuiltIn: false,
        isDroidCam: false,
        message: errMsg,
        checkedAt: new Date().toLocaleTimeString('vi-VN')
      };
      setDiagnosticInfo(failDiag);
      onDeviceStatusChange?.(failDiag);
    }
  };

  // Hàm Kiểm Tra Thiết Bị Chụp Ảnh theo yêu cầu người dùng
  const handleCheckCameraDevice = async () => {
    setActiveTab('camera');
    setCapturedPreview(null);
    await startCamera(selectedDeviceId || undefined, preferredSourceMode, true);
  };

  // Chuyển nhanh sang Camera tích hợp trên Laptop
  const handleSelectLaptopBuiltInCamera = async () => {
    setPreferredSourceMode('laptop-webcam');
    setCapturedPreview(null);
    const laptopCam = cameraDevices.find(d => d.label && !checkIsDroidCamLabel(d.label));
    const targetId = laptopCam?.deviceId || '';
    if (targetId) {
      setSelectedDeviceId(targetId);
    }
    await startCamera(targetId || undefined, 'laptop-webcam', true);
  };

  // Chuyển nhanh sang nguồn DroidCam
  const handleSelectDroidCamSource = async () => {
    setPreferredSourceMode('droidcam');
    setCapturedPreview(null);
    const droidCam = cameraDevices.find(d => d.label && checkIsDroidCamLabel(d.label));
    if (droidCam?.deviceId) {
      setSelectedDeviceId(droidCam.deviceId);
      await startCamera(droidCam.deviceId, 'droidcam', true);
    } else {
      await startCamera(undefined, 'droidcam', true);
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
    setActiveCountdown(null);
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
        `Bài dạy: ${lessonTitle} • Môn ${sportName} • Thiết bị: ${diagnosticInfo.activeDeviceName || 'Camera Laptop'} • ${new Date().toLocaleDateString('vi-VN')}`,
        24,
        canvas.height - bannerH + bannerH * 0.8
      );

      setCapturedPreview(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = sourceDataUrl;
  };

  // Thực hiện chụp snapshot từ video trực tiếp trên Laptop
  const executeImmediateSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (mirrorVideo) {
      ctx.save();
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, vw, vh);
    }

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
        `Bài dạy: ${lessonTitle} • Môn ${sportName} • Nguồn: ${diagnosticInfo.activeDeviceName || 'Camera Laptop'} • Ngày: ${new Date().toLocaleDateString('vi-VN')}`,
        24,
        vh - bannerH + bannerH * 0.8
      );
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedPreview(dataUrl);
  };

  // Bấm nút Chụp Ảnh (hỗ trợ chụp ngay hoặc hẹn giờ 3 giây để GV tạo dáng động tác trước Laptop)
  const handleCaptureSnapshot = () => {
    if (!isCameraActive) return;

    if (countdownSeconds <= 0) {
      executeImmediateSnapshot();
      return;
    }

    setActiveCountdown(countdownSeconds);
    let remaining = countdownSeconds;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        setActiveCountdown(null);
        executeImmediateSnapshot();
      } else {
        setActiveCountdown(remaining);
      }
    }, 1000);
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
    const determinedSource: 'laptop-webcam' | 'droidcam' =
      diagnosticInfo.isDroidCam || preferredSourceMode === 'droidcam'
        ? 'droidcam'
        : 'laptop-webcam';

    onPhotoCaptured({
      imageUrl: capturedPreview,
      title: photoTitle.trim() || `Ảnh thực tế: ${lessonTitle}`,
      caption: photoCaption.trim() || `Ảnh chụp thực tế bằng ${determinedSource === 'laptop-webcam' ? 'Camera Laptop' : 'DroidCam'} môn ${sportName} trường THPT Huỳnh Tấn Phát.`,
      source: determinedSource
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

  const droidCamBrowserUrl = `http://${droidCamIp.trim()}:${droidCamPort.trim()}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-2xl text-white my-auto animate-fade-in">
        
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shrink-0">
              <i className="fa-solid fa-laptop text-lg"></i>
            </span>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-emerald-300 flex items-center gap-2 flex-wrap">
                <span>Chụp Ảnh Bằng Camera Laptop & Kiểm Tra Thiết Bị Chụp Ảnh</span>
                {diagnosticInfo.isReady && (
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Thiết bị đã sẵn sàng</span>
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Hỗ trợ <strong>Camera trên Laptop (Webcam tích hợp)</strong> • <strong>Kiểm tra thiết bị tự động</strong> • <strong>DroidCam & Tải ảnh từ máy</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCheckCameraDevice}
              disabled={isStartingCamera}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-60"
              title="Kiểm tra phần cứng camera trên laptop và thông báo trạng thái sẵn sàng"
            >
              <i className={`fa-solid ${isStartingCamera ? 'fa-spinner fa-spin' : 'fa-stethoscope'}`}></i>
              <span>Kiểm Tra Thiết Bị Chụp Ảnh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Đóng cửa sổ"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
        </div>

        {/* BANNER THÔNG BÁO KẾT QUẢ KIỂM TRA THIẾT BỊ CHỤP ẢNH (HIỂN THỊ RÕ RÀNG TRạng THÁI SẴN SÀNG) */}
        <div
          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
            diagnosticInfo.isChecking || isStartingCamera
              ? 'bg-sky-950/70 border-sky-500/50 text-sky-200'
              : diagnosticInfo.isReady
              ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-100 shadow-lg shadow-emerald-950/50'
              : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base ${
                diagnosticInfo.isChecking || isStartingCamera
                  ? 'bg-sky-600 text-white'
                  : diagnosticInfo.isReady
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-rose-600 text-white'
              }`}
            >
              <i
                className={`fa-solid ${
                  diagnosticInfo.isChecking || isStartingCamera
                    ? 'fa-circle-notch fa-spin'
                    : diagnosticInfo.isReady
                    ? 'fa-circle-check'
                    : 'fa-triangle-exclamation'
                }`}
              ></i>
            </div>

            <div className="space-y-0.5 text-xs">
              <div className="font-bold flex items-center gap-2 flex-wrap">
                {diagnosticInfo.isChecking || isStartingCamera ? (
                  <span className="text-sky-300 uppercase tracking-wide">
                    ĐANG KIỂM TRA THIẾT BỊ CHỤP ẢNH TRÊN LAPTOP...
                  </span>
                ) : diagnosticInfo.isReady ? (
                  <span className="text-emerald-300 text-sm uppercase tracking-wide flex items-center gap-1.5">
                    <span>THÔNG BÁO: THIẾT BỊ CHỤP ẢNH ĐÃ SẴN SÀNG!</span>
                    <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded font-black">
                      ONLINE • SẴN SÀNG CHỤP
                    </span>
                  </span>
                ) : (
                  <span className="text-rose-300 uppercase tracking-wide">
                    TRẠNG THÁI THIẾT BỊ: CHƯA KẾT NỐI HOẶC CẦN KIỂM TRA LẠI
                  </span>
                )}
              </div>

              <p className="text-[11px] opacity-95 leading-relaxed">
                {diagnosticInfo.message}
              </p>

              {diagnosticInfo.isReady && (
                <div className="flex items-center gap-3 flex-wrap pt-1 text-[11px] text-emerald-200/90 font-mono">
                  <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    <i className="fa-solid fa-laptop mr-1 text-amber-300"></i>
                    Thiết bị: <strong>{diagnosticInfo.activeDeviceName}</strong>
                  </span>
                  <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    <i className="fa-solid fa-expand mr-1 text-sky-300"></i>
                    Độ phân giải: <strong>{diagnosticInfo.resolution}</strong>
                  </span>
                  <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    <i className="fa-solid fa-video mr-1 text-emerald-400"></i>
                    Số camera phát hiện: <strong>{diagnosticInfo.deviceCount} thiết bị</strong>
                  </span>
                  {diagnosticInfo.checkedAt && (
                    <span className="text-slate-300">
                      Kiểm tra lúc: {diagnosticInfo.checkedAt}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCheckCameraDevice}
              className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-emerald-300 border border-emerald-500/50 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <i className="fa-solid fa-rotate"></i>
              <span>Kiểm tra lại</span>
            </button>
            {readyToastMessage && (
              <button
                type="button"
                onClick={() => setReadyToastMessage('')}
                className="text-xs text-emerald-300 hover:text-white px-1.5 py-1 cursor-pointer"
                title="Ẩn thông báo"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 4 TAB ĐIỀU KHIỂN RÕ RÀNG */}
        <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setActiveTab('camera');
              setCapturedPreview(null);
              handleSelectLaptopBuiltInCamera();
            }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'camera' && preferredSourceMode === 'laptop-webcam'
                ? 'bg-emerald-700 text-white shadow-md ring-1 ring-emerald-400'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-laptop text-amber-400"></i>
            <span>1. Chụp Bằng Camera Laptop (Webcam)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('camera');
              setCapturedPreview(null);
              handleSelectDroidCamSource();
            }}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'camera' && preferredSourceMode === 'droidcam'
                ? 'bg-emerald-700 text-white shadow-md ring-1 ring-emerald-400'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <i className="fa-solid fa-video text-emerald-400"></i>
            <span>2. Camera DroidCam PC</span>
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
            <span>3. Chụp Bằng Camera Điện Thoại</span>
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
            <span>4. Hướng Dẫn DroidCam</span>
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
            <span>5. Chọn Ảnh Trên Thiết Bị</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1 & 2: CAMERA LAPTOP (WEBCAM) & DROIDCAM CLIENT       */}
        {/* ========================================================= */}
        {activeTab === 'camera' && (
          <div className="space-y-3.5">
            {/* Thanh chọn thiết bị camera trên Laptop và tùy chỉnh */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <label className="font-semibold text-slate-300 shrink-0 flex items-center gap-1.5">
                  <i className="fa-solid fa-camera text-emerald-400"></i>
                  <span>Thiết bị chụp ảnh:</span>
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedDeviceId(id);
                    startCamera(id, preferredSourceMode, true);
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-emerald-500 flex-1 min-w-[210px] max-w-sm font-medium"
                >
                  {cameraDevices.length === 0 ? (
                    <option value="">
                      {isStartingCamera ? 'Đang kiểm tra camera trên laptop...' : 'Camera Laptop mặc định (Integrated Webcam)'}
                    </option>
                  ) : (
                    cameraDevices.map((d, i) => {
                      const isDroidCam = checkIsDroidCamLabel(d.label || '');
                      return (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera Laptop ${i + 1}`} {isDroidCam ? '★ [DroidCam]' : '💻 [Camera Laptop]'}
                        </option>
                      );
                    })
                  )}
                </select>

                <button
                  type="button"
                  onClick={handleCheckCameraDevice}
                  className="px-2.5 py-1.5 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-500/40 rounded-lg cursor-pointer flex items-center gap-1.5 font-bold transition"
                  title="Kiểm tra kết nối thiết bị chụp ảnh và làm mới luồng video"
                >
                  <i className="fa-solid fa-circle-check text-amber-300"></i>
                  <span>Kiểm tra thiết bị</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                {/* Hẹn giờ chụp (Hữu ích khi GV tự chụp động tác mẫu trước Camera Laptop) */}
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                  <i className="fa-solid fa-stopwatch text-amber-400"></i>
                  <span className="text-slate-300">Hẹn giờ:</span>
                  {[0, 3, 5].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setCountdownSeconds(sec)}
                      className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                        countdownSeconds === sec
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sec === 0 ? 'Chụp ngay' : `${sec}s`}
                    </button>
                  ))}
                </div>

                {/* Lật gương (Mirror) cho Camera trước của Laptop */}
                <button
                  type="button"
                  onClick={() => setMirrorVideo(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer border transition ${
                    mirrorVideo
                      ? 'bg-sky-700 text-white border-sky-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Lật ngược khung hình ngang (tiện lợi khi dùng Webcam trước của Laptop)"
                >
                  <i className="fa-solid fa-arrows-left-right text-amber-300"></i>
                  <span>Lật gương</span>
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

            {/* Khung hình Live Video từ Camera Laptop hoặc Ảnh đã chụp */}
            {!capturedPreview ? (
              <div className="relative bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-800 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'} ${
                    mirrorVideo ? '-scale-x-100' : ''
                  }`}
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

                {/* Huy hiệu trạng thái Thiết bị chụp ảnh đã sẵn sàng ngay trên góc màn hình Camera Laptop */}
                {isCameraActive && (
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
                    <div className="bg-slate-900/90 border border-emerald-400/60 px-3 py-1.5 rounded-lg text-[11px] font-sans flex items-center gap-2 shadow-lg">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold text-emerald-300">
                        Thiết bị chụp ảnh đã sẵn sàng:
                      </span>
                      <span className="text-white font-semibold">
                        {diagnosticInfo.activeDeviceName || 'Camera Laptop'}
                      </span>
                    </div>

                    <div className="bg-slate-900/85 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-mono text-amber-300 shadow-md">
                      {diagnosticInfo.resolution || 'HD 720p'} • {diagnosticInfo.frameRate || '60 FPS'}
                    </div>
                  </div>
                )}

                {/* Đồng hồ đếm ngược khi hẹn giờ chụp trên Laptop */}
                {activeCountdown !== null && (
                  <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 pointer-events-none">
                    <div className="w-24 h-24 rounded-full bg-emerald-600/90 border-4 border-white flex items-center justify-center text-5xl font-black text-white shadow-2xl animate-bounce">
                      {activeCountdown}
                    </div>
                    <p className="mt-3 text-sm font-bold text-amber-300 bg-slate-900/90 px-4 py-1 rounded-full">
                      Chuẩn bị tư thế trước Camera Laptop...
                    </p>
                  </div>
                )}

                {/* Nút chụp ảnh bằng Camera Laptop nổi bật */}
                {isCameraActive && (
                  <div className="absolute bottom-4 inset-x-0 flex justify-center items-center gap-3 pointer-events-auto px-4">
                    <button
                      type="button"
                      onClick={handleCaptureSnapshot}
                      disabled={activeCountdown !== null}
                      className="px-7 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-full shadow-2xl flex items-center gap-2.5 cursor-pointer transition transform active:scale-95 border-2 border-white/70 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-camera text-xl text-amber-300"></i>
                      <span className="text-sm uppercase tracking-wide">
                        {countdownSeconds > 0
                          ? `Chụp Bằng Camera Laptop (Hẹn giờ ${countdownSeconds}s)`
                          : 'Chụp Ảnh Bằng Camera Laptop Ngay'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Trạng thái đang kiểm tra / khởi động camera */}
                {isStartingCamera && !cameraError && (
                  <div className="flex flex-col items-center justify-center p-6 space-y-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-400"></i>
                    <p className="text-xs text-slate-200 font-bold">
                      Đang kiểm tra thiết bị chụp ảnh và kích hoạt Camera trên Laptop...
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Hệ thống sẽ thông báo ngay khi thiết bị chụp ảnh đã sẵn sàng.
                    </p>
                  </div>
                )}

                {/* Giao diện khi Camera chưa chạy hoặc bị lỗi */}
                {!isCameraActive && !isStartingCamera && (
                  <div className="p-6 text-center space-y-3 max-w-lg">
                    <div className="w-14 h-14 mx-auto rounded-full bg-slate-800 text-amber-400 flex items-center justify-center text-2xl border border-slate-700">
                      <i className="fa-solid fa-laptop"></i>
                    </div>

                    {cameraError ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-rose-300 font-semibold leading-relaxed">{cameraError}</p>
                        <p className="text-[11px] text-slate-400">
                          Thầy/Cô có thể bấm <strong>"Kiểm Tra & Bật Camera Laptop"</strong> hoặc dùng tính năng <strong>"Chọn Ảnh Trên Thiết Bị"</strong>.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-200">Camera trên Laptop chưa được kích hoạt</p>
                        <p className="text-[11px] text-slate-400">
                          Bấm nút bên dưới để kiểm tra thiết bị chụp ảnh, mở Webcam Laptop và nhận thông báo thiết bị sẵn sàng.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleCheckCameraDevice}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
                      >
                        <i className="fa-solid fa-camera text-amber-300"></i>
                        <span>Kiểm Tra & Bật Camera Laptop</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-slate-700"
                      >
                        <i className="fa-solid fa-folder-open text-purple-400"></i>
                        <span>Chọn Ảnh Từ Laptop</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Xem lại ảnh đã chụp từ Camera Laptop và điền thông tin */
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border-2 border-emerald-500/70 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-circle-check"></i>
                    <span>
                      Đã chụp ảnh bằng {diagnosticInfo.activeDeviceName || 'Camera Laptop'} thành công! Xem lại và lưu vào KHBD:
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCapturedPreview(null)}
                    className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer font-bold"
                  >
                    <i className="fa-solid fa-arrow-rotate-left mr-1"></i>
                    Chụp lại bằng Camera Laptop
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-5 rounded-lg overflow-hidden border border-slate-800">
                    <img src={capturedPreview} alt="Ảnh chụp từ Camera Laptop" className="w-full h-44 object-contain bg-black" />
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
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Đưa Ảnh Vào Kế Hoạch Bài Dạy</span>
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
        {/* TAB 3: CHỤP TRỰC TIẾP BẰNG CAMERA ĐIỆN THOẠI (NATIVE HTML5) */}
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
        {/* TAB 4: HƯỚNG DẪN KẾT NỐI DROIDCAM CHUẨN XÁC                */}
        {/* ========================================================= */}
        {activeTab === 'droidcam-guide' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3.5 text-xs">
              
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-b border-slate-800 pb-2">
                <i className="fa-solid fa-circle-info"></i>
                <span>Cách Kết Nối DroidCam Với Laptop Chuẩn Nhất:</span>
              </div>

              {/* 3 BƯỚC DROIDCAM CLIENT */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">1</span>
                    <span>Cài Đặt DroidCam</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Cài ứng dụng <strong>DroidCam</strong> trên điện thoại (CH Play / App Store) và phần mềm <strong>DroidCam Client</strong> trên laptop từ trang chủ <code>dev47apps.com</code>.
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">2</span>
                    <span>Bấm Start Trên Laptop</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Kết nối điện thoại với laptop qua <strong>Cáp USB</strong> hoặc chung WiFi, nhập IP điện thoại vào phần mềm máy tính rồi bấm <strong>Start</strong>.
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">3</span>
                    <span>Chọn Nguồn Trên Web</span>
                  </span>
                  <p className="text-slate-300 leading-relaxed">
                    Bấm nút <strong>"Kiểm Tra Thiết Bị Chụp Ảnh"</strong> ở góc trên, chọn <strong>"DroidCam Source"</strong> trong danh sách thiết bị là có thể chụp ngay!
                  </p>
                </div>
              </div>

              {/* TRƯỜNG HỢP XEM QUA ĐỊA CHỈ IP WIFI */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-sky-400">Cấu hình địa chỉ IP DroidCam nội bộ:</h4>
                    <p className="text-slate-400 text-[11px]">
                      Khi xem camera trên DroidCam, Thầy/Cô cũng có thể chụp màn hình (<code>Win + Shift + S</code>) rồi bấm <strong>Ctrl + V</strong> ngay tại cửa sổ này để tự động dán ảnh.
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
                    <span>Mở Luồng DroidCam ({droidCamIp}:{droidCamPort})</span>
                  </a>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: CHỌN ẢNH CÓ SẴN TRÊN THIẾT BỊ                      */}
        {/* ========================================================= */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-emerald-500/60 rounded-2xl p-6 text-center space-y-3 bg-slate-950/70 hover:bg-slate-950 transition">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-xl">
                <i className="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-200">
                  Chọn ảnh chụp học sinh, sân bãi hoặc dụng cụ từ Laptop / Điện thoại
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
