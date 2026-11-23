import React, { useState } from 'react';
import { Role, UserAccount, TeacherProfile } from '../types';
import { TEACHERS_LIST } from '../data/curriculum';
import { SUPER_ADMIN_EMAILS, isSuperAdminEmail } from '../data/schoolData';

interface AuthPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthorized: boolean;
  onAuthorize: (username: string, password: string) => boolean;
  onRevoke: () => void;
  currentCode: string;
  onChangeCode: (newCode: string) => void;
  userRole: Role;
  onChangeRole?: (role: Role) => void;
  userName?: string;
  currentUserAccount?: UserAccount | null;
  onGoogleLogin?: () => Promise<void>;
  onGoogleLogout?: () => Promise<void>;
  onOpenAdminCenter?: () => void;
  teachers?: TeacherProfile[];
}

export const AuthPermissionModal: React.FC<AuthPermissionModalProps> = ({
  isOpen,
  onClose,
  isAuthorized,
  onAuthorize,
  onRevoke,
  onChangeCode,
  onChangeRole,
  userName = 'Giáo viên GDTC',
  currentUserAccount,
  onGoogleLogin,
  onGoogleLogout,
  onOpenAdminCenter,
  teachers
}) => {
  const [inputUsername, setInputUsername] = useState(userName !== 'Học sinh' ? userName : '');
  const [inputPassword, setInputPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showChangeCodeTab, setShowChangeCodeTab] = useState(false);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [confirmCodeInput, setConfirmCodeInput] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  if (!isOpen) return null;

  const teacherNames = teachers && teachers.length > 0 ? teachers.map(t => t.name) : TEACHERS_LIST;
  const isSuperAdmin = isSuperAdminEmail(currentUserAccount?.email);

  const handleGoogleSignInClick = async () => {
    if (!onGoogleLogin) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsGoogleLoading(true);
    try {
      await onGoogleLogin();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google. Vui lòng thử lại.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleSignOutClick = async () => {
    if (!onGoogleLogout) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsGoogleLoading(true);
    try {
      await onGoogleLogout();
      setSuccessMsg('Đã đăng xuất khỏi tài khoản Google.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi đăng xuất tài khoản Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanUser = inputUsername.trim();
    const cleanPass = inputPassword.trim();
    if (!cleanUser) {
      setErrorMsg('Vui lòng nhập tên người dùng / tài khoản giáo viên!');
      return;
    }
    if (!cleanPass) {
      setErrorMsg('Vui lòng nhập mật khẩu cấp quyền!');
      return;
    }

    const success = onAuthorize(cleanUser, cleanPass);
    if (success) {
      setSuccessMsg(`Xác thực thành công! Đã cấp quyền Giáo viên cho tài khoản: ${cleanUser}.`);
      if (onChangeRole) {
        onChangeRole('gv');
      }
      setTimeout(() => {
        onClose();
        setInputPassword('');
        setSuccessMsg('');
      }, 1000);
    } else {
      setErrorMsg('Tên người dùng hoặc mật khẩu không chính xác! Vui lòng đăng nhập bằng tài khoản Google Admin hoặc liên hệ Thầy Bồ Công Lâm (0984511901).');
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newCodeInput.length < 4) {
      setErrorMsg('Mã cấp quyền mới phải có ít nhất 4 ký tự!');
      return;
    }
    if (newCodeInput !== confirmCodeInput) {
      setErrorMsg('Xác nhận mã mới không trùng khớp!');
      return;
    }

    onChangeCode(newCodeInput);
    setSuccessMsg('Đã đổi mã cấp quyền chuyên môn thành công!');
    setNewCodeInput('');
    setConfirmCodeInput('');
    setTimeout(() => {
      setShowChangeCodeTab(false);
      setSuccessMsg('');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 my-4">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 text-white p-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-inner ${
              isAuthorized ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
            }`}>
              <i className={`fa-solid ${isAuthorized ? 'fa-shield-halved' : 'fa-lock'}`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-2xs ${
                  isSuperAdmin
                    ? 'bg-amber-400 text-slate-950'
                    : isAuthorized
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-400 text-slate-950'
                }`}>
                  {isSuperAdmin ? 'QUẢN TRỊ VIÊN HỆ THỐNG (SUPER ADMIN)' : isAuthorized ? 'ĐÃ ĐƯỢC CẤP QUYỀN' : 'XÁC THỰC & PHÂN QUYỀN'}
                </span>
                <span className="text-xs text-emerald-300 font-semibold">
                  THPT Huỳnh Tấn Phát
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">
                Xác Thực Google, Phân Quyền Quản Trị & Bảo Mật Dữ Liệu
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
            title="Đóng hộp thoại"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Status Banner */}
        <div className={`px-5 py-3 border-b text-xs flex items-center justify-between gap-2 flex-wrap ${
          isAuthorized
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : currentUserAccount?.status === 'pending'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-slate-100 border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${
              isAuthorized
                ? 'fa-circle-check text-emerald-600'
                : currentUserAccount?.status === 'pending'
                ? 'fa-clock text-amber-600'
                : 'fa-triangle-exclamation text-amber-600'
            } text-sm`}></i>
            <span className="font-semibold">
              {isSuperAdmin
                ? `Toàn quyền Quản trị hệ thống (${currentUserAccount?.email})`
                : isAuthorized
                ? 'Tài khoản đã được phê duyệt quyền Giáo viên / Quản trị dữ liệu'
                : currentUserAccount?.status === 'pending'
                ? `Tài khoản ${currentUserAccount.email} đang chờ Admin phê duyệt`
                : 'Chưa xác thực quyền quản lý dữ liệu hệ thống'}
            </span>
          </div>
          {isAuthorized && (
            <button
              onClick={() => {
                onRevoke();
                setSuccessMsg('Đã khóa quyền truy cập dữ liệu trên thiết bị này!');
                setTimeout(() => setSuccessMsg(''), 2000);
              }}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-md font-bold text-[11px] border border-red-300 transition cursor-pointer"
              title="Khóa quyền ngay để tránh người khác xem dữ liệu học sinh"
            >
              <i className="fa-solid fa-lock mr-1"></i>
              Khóa quyền / Đăng xuất
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs md:text-sm max-h-[75vh] overflow-y-auto">

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2 font-medium">
              <i className="fa-solid fa-circle-exclamation text-red-600"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl flex items-center gap-2 font-bold animate-in fade-in">
              <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
              <span>{successMsg}</span>
            </div>
          )}

          {/* KHỐI 1: ĐĂNG NHẬP & XÁC THỰC BẰNG TÀI KHOẢN GOOGLE */}
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50/60 to-slate-50 p-4 rounded-xl border border-blue-200 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-700 text-white">
                  <i className="fa-brands fa-google"></i> Xác thực đám mây Google
                </span>
                <h4 className="font-bold text-slate-900 text-sm mt-1">
                  Đăng nhập Hệ thống bằng Tài khoản Google
                </h4>
              </div>
              {onOpenAdminCenter && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdminCenter();
                  }}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-sliders"></i>
                  <span>Mở Trung tâm Quản trị</span>
                </button>
              )}
            </div>

            <div className="text-xs text-slate-700 space-y-1 leading-relaxed bg-white/80 p-3 rounded-lg border border-blue-100">
              <p>
                • <strong>Quản trị viên tối cao (Super Admin):</strong> Đăng nhập bằng{' '}
                <code className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">{SUPER_ADMIN_EMAILS[0]}</code> hoặc{' '}
                <code className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">{SUPER_ADMIN_EMAILS[1]}</code>{' '}
                để nhận <strong>toàn quyền xử lý dữ liệu hệ thống</strong> và <strong>phân quyền</strong> cho các tài khoản khác.
              </p>
              <p>
                • <strong>Tài khoản Giáo viên / Cán bộ khác:</strong> Đăng nhập bằng Google sẽ gửi thông báo yêu cầu xét duyệt trực tiếp đến{' '}
                <strong>{SUPER_ADMIN_EMAILS.join(' & ')}</strong>. Sau khi Admin phê duyệt sẽ được cấp quyền thao tác theo phân quyền.
              </p>
            </div>

            {currentUserAccount ? (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {currentUserAccount.photoURL ? (
                    <img
                      src={currentUserAccount.photoURL}
                      alt={currentUserAccount.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-emerald-400"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-black flex items-center justify-center text-sm">
                      {(currentUserAccount.displayName || currentUserAccount.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{currentUserAccount.displayName}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        isSuperAdmin
                          ? 'bg-amber-400 text-slate-950'
                          : currentUserAccount.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : currentUserAccount.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isSuperAdmin
                          ? 'Super Admin'
                          : currentUserAccount.status === 'approved'
                          ? 'Đã được Admin duyệt'
                          : currentUserAccount.status === 'pending'
                          ? 'Đang chờ Admin duyệt'
                          : 'Từ chối'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{currentUserAccount.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentUserAccount.status === 'pending' && (
                    <a
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPER_ADMIN_EMAILS.join(','))}&su=${encodeURIComponent(`[EduSport THPT Huỳnh Tấn Phát] Đề nghị xét duyệt tài khoản ${currentUserAccount.email}`)}&body=${encodeURIComponent(`Kính gửi Admin (${SUPER_ADMIN_EMAILS.join(', ')}),\n\nTôi đã đăng nhập hệ thống GDTC THPT Huỳnh Tấn Phát bằng tài khoản Google:\n- Họ tên: ${currentUserAccount.displayName}\n- Email: ${currentUserAccount.email}\n\nKính đề nghị Admin phê duyệt và cấp quyền sử dụng hệ thống.\nTrân trọng!`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5"
                    >
                      <i className="fa-solid fa-envelope"></i>
                      <span>Gửi Gmail nhắc Admin</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleGoogleSignOutClick}
                    disabled={isGoogleLoading}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 transition cursor-pointer"
                  >
                    Đổi tài khoản Google
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignInClick}
                disabled={isGoogleLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl border-2 border-blue-600 shadow-xs transition cursor-pointer flex items-center justify-center gap-2.5 text-sm"
              >
                <i className="fa-brands fa-google text-red-500 text-base"></i>
                <span>
                  {isGoogleLoading
                    ? 'Đang kết nối xác thực Google...'
                    : 'Đăng nhập & Xác thực bằng Tài khoản Google'}
                </span>
              </button>
            )}
          </div>

          {/* KHỐI 2: MÃ CẤP QUYỀN NỘI BỘ HOẶC TRẠNG THÁI QUYỀN */}
          {!isAuthorized ? (
            <form onSubmit={handleUnlock} className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Hoặc mở khóa nhanh bằng Mã cấp quyền Tổ bộ môn:
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  Liên hệ Thầy Bồ Công Lâm (0984511901)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-xs">
                    Tên Giáo viên / Quản trị:
                  </label>
                  <input
                    type="text"
                    value={inputUsername}
                    onChange={(e) => setInputUsername(e.target.value)}
                    placeholder="VD: Bồ Công Lâm..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-xs">
                    Mã cấp quyền:
                  </label>
                  <input
                    type="password"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    placeholder="Nhập mã cấp quyền..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Gợi ý chọn nhanh giáo viên */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500">Chọn nhanh GV:</span>
                {teacherNames.slice(0, 5).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInputUsername(t)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium border border-slate-200 transition cursor-pointer"
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none text-xs">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Ghi nhớ phiên đăng nhập trên thiết bị này</span>
                </label>

                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5 text-xs"
                >
                  <i className="fa-solid fa-key"></i>
                  <span>Xác Nhận Mã Cấp Quyền</span>
                </button>
              </div>
            </form>
          ) : (
            /* TRẠNG THÁI ĐÃ CẤP QUYỀN */
            <div className="space-y-3">
              <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-2">
                <h4 className="font-bold text-emerald-950 flex items-center gap-2">
                  <i className="fa-solid fa-badge-check text-emerald-600"></i>
                  <span>Quyền Hạn Đang Kích Hoạt Trên Hệ Thống:</span>
                </h4>
                <ul className="space-y-1 text-xs text-emerald-900 list-disc list-inside">
                  <li><strong>Học sinh, Lớp học, Giáo viên:</strong> Cập nhật hàng loạt từ file Excel (.xlsx, .csv) và xoá hàng loạt.</li>
                  <li><strong>Quản trị & Phân quyền:</strong> Admin (<code className="font-bold">boconglam@gmail.com</code>, <code className="font-bold">tdtt.htp@gmail.com</code>) xét duyệt tài khoản Google và phân quyền chi tiết.</li>
                  <li><strong>Nhật ký hoạt động:</strong> Tự động ghi nhận mọi thao tác sửa, xoá, nhập Excel, phân quyền trên hệ thống.</li>
                </ul>
              </div>

              {/* Tùy chọn đổi mã cấp quyền */}
              <div className="pt-2 border-t border-slate-200">
                {!showChangeCodeTab ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Mã cấp quyền dự phòng hiện tại: ••••••••
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowChangeCodeTab(true)}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-gear"></i>
                      <span>Đổi mã cấp quyền dự phòng</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">
                        Đổi mã cấp quyền Tổ bộ môn GDTC:
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowChangeCodeTab(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        Hủy
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Mã mới:</label>
                        <input
                          type="password"
                          value={newCodeInput}
                          onChange={(e) => setNewCodeInput(e.target.value)}
                          placeholder="Mã mới (tối thiểu 4 ký tự)..."
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Xác nhận mã:</label>
                        <input
                          type="password"
                          value={confirmCodeInput}
                          onChange={(e) => setConfirmCodeInput(e.target.value)}
                          placeholder="Gõ lại mã mới..."
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                    >
                      Lưu mã cấp quyền mới
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 italic">
            Hệ thống quản lý GDTC & Sức khỏe THPT Huỳnh Tấn Phát
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
