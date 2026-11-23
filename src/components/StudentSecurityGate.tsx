import React, { useState } from 'react';
import { StudentProfile } from '../types';
import { TEACHERS_LIST } from '../data/curriculum';

interface StudentSecurityGateProps {
  students: StudentProfile[];
  onAuthorize: (username: string, password: string) => boolean;
  onOpenAuthModal: () => void;
  title?: string;
  description?: string;
}

export const StudentSecurityGate: React.FC<StudentSecurityGateProps> = ({
  students,
  onAuthorize,
  onOpenAuthModal,
  title = 'Dữ Liệu Học Sinh Được Bảo Mật',
  description = 'Theo quy chế quản lý dữ liệu nhân trắc học và hồ sơ y tế THPT Huỳnh Tấn Phát, bạn cần được cấp quyền Giáo viên / Quản trị viên để xem toàn bộ danh sách và chỉnh sửa dữ liệu.'
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'unlock' | 'lookup'>('unlock');

  // Student personal lookup state
  const [lookupClass, setLookupClass] = useState<string>('all');
  const [lookupTerm, setLookupTerm] = useState<string>('');
  const [foundStudent, setFoundStudent] = useState<StudentProfile | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string>('');

  const availableClasses = Array.from(new Set(students.map(s => s.class))).filter(Boolean).sort();

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim()) {
      setErrorMsg('Vui lòng nhập tên người dùng / tài khoản giáo viên!');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Vui lòng nhập mật khẩu cấp quyền!');
      return;
    }
    const success = onAuthorize(username.trim(), password.trim());
    if (!success) {
      setErrorMsg('Tên người dùng hoặc mật khẩu không đúng! Vui lòng liên hệ Thầy Bồ Công Lâm (0984511901) để được cấp quyền.');
    }
  };

  const handleTeacherAuth = () => {
    // Luôn mở hộp thoại yêu cầu giáo viên nhập tài khoản và mật khẩu
    onOpenAuthModal();
  };

  const handlePersonalLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setLookupMessage('');
    setFoundStudent(null);

    const term = lookupTerm.trim().toLowerCase();
    if (!term) {
      setLookupMessage('Vui lòng nhập mã số học sinh hoặc họ tên!');
      return;
    }

    const matched = students.find(s => {
      const matchClass = lookupClass === 'all' || s.class === lookupClass;
      const matchCode = s.code?.toLowerCase() === term || s.id?.toLowerCase() === term;
      const matchName = s.name.toLowerCase().includes(term);
      return matchClass && (matchCode || matchName);
    });

    if (matched) {
      setFoundStudent(matched);
    } else {
      setLookupMessage('Không tìm thấy học sinh phù hợp với thông tin tra cứu. Vui lòng kiểm tra lại lớp hoặc mã số!');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm max-w-3xl mx-auto my-6 space-y-6">
      
      {/* Icon & Title */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 flex items-center justify-center text-3xl mx-auto shadow-inner">
          <i className="fa-solid fa-user-shield"></i>
        </div>
        <div className="inline-block bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-0.5 rounded-full text-xs">
          BẢO VỆ DỮ LIỆU & QUYỀN TRUY CẬP
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {/* Switcher Tab: Mở khóa Giáo viên vs Học sinh tra cứu cá nhân */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-md mx-auto text-xs font-bold border border-slate-200">
        <button
          onClick={() => setActiveTab('unlock')}
          className={`flex-1 py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'unlock'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <i className="fa-solid fa-key"></i>
          <span>Xác Thực Cấp Quyền (GV)</span>
        </button>
        <button
          onClick={() => setActiveTab('lookup')}
          className={`flex-1 py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'lookup'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <i className="fa-solid fa-magnifying-glass"></i>
          <span>Học Sinh Tra Cứu Riêng</span>
        </button>
      </div>

      {/* TAB 1: FORM CẤP QUYỀN GIÁO VIÊN */}
      {activeTab === 'unlock' && (
        <div className="space-y-4 max-w-md mx-auto">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 font-medium">
              <i className="fa-solid fa-circle-exclamation text-red-600"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleUnlockSubmit} className="space-y-3">
            <div>
              <label className="block font-bold text-slate-800 text-xs mb-1 flex items-center justify-between">
                <span>Tên người dùng / Tài khoản Giáo viên:</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập (VD: Bồ Công Lâm, admin)..."
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                autoFocus
              />
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-[10px] text-slate-500">Gợi ý:</span>
                {TEACHERS_LIST.slice(0, 3).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUsername(t)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-medium border border-slate-200 transition cursor-pointer"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-800 text-xs mb-1">
                Mật khẩu:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu cấp quyền..."
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer shadow-xs whitespace-nowrap flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-right-to-bracket"></i>
                  <span>Đăng nhập</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={handleTeacherAuth}
                className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer text-xs flex items-center gap-1.5"
              >
                <i className="fa-solid fa-key text-[11px]"></i>
                <span>Xác thực chi tiết (Tài khoản & Mật khẩu)</span>
              </button>
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="text-slate-500 hover:text-slate-800 underline text-xs"
              >
                Trợ giúp cấp quyền
              </button>
            </div>
          </form>

          <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
            <i className="fa-solid fa-shield-halved text-emerald-700 mt-0.5 text-xs"></i>
            <div>
              <strong>Lưu ý bảo mật:</strong> Mật khẩu quản lý dữ liệu học sinh chỉ được cấp cho giáo viên bộ môn GDTC trường THPT Huỳnh Tấn Phát. Liên hệ Thầy Bồ Công Lâm để nhận mã cấp quyền, điện thoại: <strong>0984511901</strong> hoặc Zalo: <strong>0984511901</strong>.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HỌC SINH TRA CỨU CÁ NHÂN */}
      {activeTab === 'lookup' && (
        <div className="space-y-4 max-w-lg mx-auto">
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-xs text-blue-900">
            <p className="font-semibold flex items-center gap-1.5">
              <i className="fa-solid fa-shield text-blue-600"></i>
              <span>Quyền riêng tư học sinh:</span>
            </p>
            <p className="text-[11px] text-blue-800 mt-0.5">
              Học sinh tra cứu sẽ chỉ xem được kết quả thể trạng, chỉ số BMI và bài tập thích ứng của chính mình mà không nhìn thấy dữ liệu của các bạn khác.
            </p>
          </div>

          <form onSubmit={handlePersonalLookup} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn lớp:</label>
                <select
                  value={lookupClass}
                  onChange={(e) => setLookupClass(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                >
                  <option value="all">-- Tất cả lớp --</option>
                  {availableClasses.map(c => (
                    <option key={c} value={c}>Lớp {c}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Mã HS hoặc Họ tên:</label>
                <input
                  type="text"
                  value={lookupTerm}
                  onChange={(e) => setLookupTerm(e.target.value)}
                  placeholder="Gõ mã HS (VD: HS-10A1-01) hoặc tên..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-magnifying-glass"></i>
              <span>Tra cứu hồ sơ thể chất của em</span>
            </button>
          </form>

          {lookupMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium">
              {lookupMessage}
            </div>
          )}

          {/* KẾT QUẢ TRA CỨU CÁ NHÂN */}
          {foundStudent && (
            <div className="bg-slate-50 p-4 rounded-xl border-2 border-emerald-500 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    Mã số: {foundStudent.code} • Lớp {foundStudent.class}
                  </span>
                  <h4 className="text-base font-bold text-slate-900 mt-1">
                    {foundStudent.name}
                  </h4>
                </div>
                <div className="text-right">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                    foundStudent.status === 'standard' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                    foundStudent.status === 'overweight' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    foundStudent.status === 'underweight' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                    'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {foundStudent.status === 'standard' ? 'Chuẩn thể lực' :
                     foundStudent.status === 'overweight' ? 'Thừa cân' :
                     foundStudent.status === 'underweight' ? 'Thiếu cân' : 'Bệnh nền nhẹ'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Chiều cao</span>
                  <strong className="text-sm text-slate-900">{foundStudent.heightCm} cm</strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Cân nặng</span>
                  <strong className="text-sm text-slate-900">{foundStudent.weightKg} kg</strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Chỉ số BMI</span>
                  <strong className="text-sm text-emerald-800">{foundStudent.bmi}</strong>
                </div>
              </div>

              {foundStudent.medicalNote && (
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                  <span className="font-bold text-slate-700">Ghi chú y tế & Thể trạng:</span>
                  <p className="text-slate-600 mt-0.5">{foundStudent.medicalNote}</p>
                </div>
              )}

              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-xs text-emerald-900">
                <span className="font-bold">Đánh giá chuyên môn GDTC:</span>
                <p className="mt-0.5">{foundStudent.evalTech} • {foundStudent.evalAttitude}</p>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
