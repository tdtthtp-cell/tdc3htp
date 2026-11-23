import React from 'react';
import { SportKey, Role, UserAccount } from '../types';
import { SPORTS_LIST } from '../data/curriculum';
import { isSuperAdminEmail } from '../data/schoolData';

interface HeaderProps {
  currentSport: SportKey;
  userRole: Role;
  userName: string;
  onSwitchTab: (tabId: string) => void;
  onSaveSession: () => void;
  onOpenTimerModal: () => void;
  unreadCount?: number;
  isAuthorized?: boolean;
  onOpenAuthModal?: () => void;
  currentUserAccount?: UserAccount | null;
  pendingApprovalCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentSport,
  userRole,
  userName,
  onSwitchTab,
  onSaveSession,
  onOpenTimerModal,
  unreadCount = 2,
  isAuthorized = false,
  onOpenAuthModal,
  currentUserAccount,
  pendingApprovalCount = 0
}) => {
  const sportName = SPORTS_LIST.find(s => s.key === currentSport)?.name || 'GDTC ĐẶC THÙ THPT';
  const isSuperAdmin = isSuperAdminEmail(currentUserAccount?.email);

  return (
    <header className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 text-white shadow-md border-b border-emerald-800/40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        
        {/* Logo & Tên ứng dụng */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-400/40 flex items-center justify-center text-emerald-400 text-xl shadow-inner">
            <i className="fa-solid fa-heart-pulse"></i>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded tracking-wide uppercase shadow-xs">
                AI GDTC 4.0
              </span>
              <span className="bg-emerald-700/80 text-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 border border-emerald-600/30">
                <i className={`fa-solid ${currentSport === 'bong-ro' ? 'fa-basketball' : currentSport === 'bong-chuyen' ? 'fa-volleyball' : currentSport === 'cau-long' ? 'fa-feather' : 'fa-futbol'} text-[10px]`}></i>
                <span id="headerCurSubj">CHUYÊN MÔN {sportName.toUpperCase()}</span>
              </span>
              <span className="text-xs text-emerald-300/80 hidden md:inline">
                ● GDPT 2018 • Chuẩn CV 5512 & 7991 • PPCT 70 Tiết
              </span>
            </div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2 mt-0.5">
              EduSport AI - GDTC & Sức Khỏe Học Đường
            </h1>
            <p className="text-xs text-emerald-200/90 font-medium">
              <span className="text-amber-300 font-semibold">
                {isSuperAdmin ? 'Quản trị viên (Admin)' : userRole === 'gv' ? 'Giáo viên' : 'Học sinh'}: {userName}
              </span>{' '}
              {currentUserAccount?.email && (
                <span className="text-emerald-300 font-mono text-[11px]">({currentUserAccount.email}) </span>
              )}
              • <span className="text-emerald-100">Bộ môn: Giáo dục Thể chất</span> •{' '}
              <span className="text-emerald-300">Trường THPT Huỳnh Tấn Phát</span>
            </p>
          </div>
        </div>

        {/* Tiện ích bên phải */}
        <div className="flex items-center space-x-2 text-xs flex-wrap">
          <button
            onClick={() => onSwitchTab('tab-quantri')}
            title="Quản lý Học sinh, Lớp học, Giáo viên (Excel/Xoá hàng loạt), Phân quyền Google & Nhật ký hệ thống"
            className="relative flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-600 border border-indigo-400/50 px-3 py-1.5 rounded-lg text-white font-bold transition cursor-pointer shadow-xs"
          >
            <i className="fa-solid fa-user-shield text-amber-300"></i>
            <span>Quản Trị Hệ Thống</span>
            {pendingApprovalCount > 0 && (
              <span className="w-4 h-4 bg-amber-400 text-slate-950 rounded-full text-[10px] font-black flex items-center justify-center animate-bounce">
                {pendingApprovalCount}
              </span>
            )}
          </button>

          {/* Nút Trạng thái Cấp quyền / Google Auth */}
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              title={
                isSuperAdmin
                  ? `Quản trị viên tối cao: ${currentUserAccount?.email}`
                  : isAuthorized
                  ? 'Đã được cấp quyền Giáo viên / Quản trị viên'
                  : 'Đăng nhập Google hoặc nhập mã cấp quyền'
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs border ${
                isSuperAdmin
                  ? 'bg-amber-400 hover:bg-amber-300 border-amber-300 text-slate-950'
                  : isAuthorized
                  ? 'bg-emerald-900/90 hover:bg-emerald-800 border-emerald-500/70 text-emerald-200'
                  : currentUserAccount?.status === 'pending'
                  ? 'bg-amber-600/90 hover:bg-amber-500 border-amber-300 text-white'
                  : 'bg-amber-400 hover:bg-amber-300 border-amber-300 text-slate-950'
              }`}
            >
              <i className={`fa-solid ${isSuperAdmin ? 'fa-crown text-slate-950' : isAuthorized ? 'fa-shield-halved text-emerald-300' : 'fa-lock text-slate-900'}`}></i>
              <span>
                {isSuperAdmin
                  ? 'Admin Google'
                  : isAuthorized
                  ? 'Đã cấp quyền (GV)'
                  : currentUserAccount?.status === 'pending'
                  ? 'Chờ Admin duyệt'
                  : 'Đăng nhập Google'}
              </span>
            </button>
          )}

          <button
            onClick={onOpenTimerModal}
            title="Đồng hồ bấm giờ & Đếm nhịp vận động"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg text-slate-200 font-medium transition cursor-pointer"
          >
            <i className="fa-solid fa-stopwatch text-amber-400"></i>
            <span className="hidden sm:inline">Bấm giờ</span>
          </button>

          <button
            onClick={onSaveSession}
            title="Trung tâm sao lưu & đồng bộ hồ sơ giữa máy tính và điện thoại"
            className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 px-3 py-1.5 rounded-lg text-white font-semibold transition cursor-pointer shadow-xs"
          >
            <i className="fa-solid fa-cloud-arrow-up text-amber-300"></i>
            <span>Sao lưu & Đồng bộ</span>
          </button>

          <button
            onClick={() => onSwitchTab('tab-phuhuynh')}
            className="relative flex items-center gap-1.5 bg-rose-700 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg font-semibold shadow-sm transition cursor-pointer"
          >
            <i className="fa-solid fa-heart"></i>
            <span>Cổng Phụ Huynh</span>
            {unreadCount > 0 && (
              <span className="w-4 h-4 bg-white text-rose-700 rounded-full text-[10px] font-black flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
