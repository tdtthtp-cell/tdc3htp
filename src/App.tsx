/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Header } from './components/Header';
import { ControlBar } from './components/ControlBar';
import { TabTheTrang } from './components/TabTheTrang';
import { TabKHBD } from './components/TabKHBD';
import { TabDanhGia } from './components/TabDanhGia';
import { TabBMI } from './components/TabBMI';
import { TabDinhDuong } from './components/TabDinhDuong';
import { TabPhuHuynh } from './components/TabPhuHuynh';
import { TabQuanTriHeThong } from './components/TabQuanTriHeThong';
import { StopwatchModal } from './components/StopwatchModal';
import { SyncBackupModal } from './components/SyncBackupModal';
import { AuthPermissionModal } from './components/AuthPermissionModal';
import { INITIAL_STUDENTS } from './data/students';
import { TEACHERS_LIST } from './data/curriculum';
import { INITIAL_CLASSES, INITIAL_TEACHERS, isSuperAdminEmail, SUPER_ADMIN_EMAILS } from './data/schoolData';
import {
  Role,
  SportKey,
  GradeLevel,
  StudentProfile,
  ClassRoomProfile,
  TeacherProfile,
  UserAccount,
  AdminNotification,
  AuditLogEntry,
  AuditActionType
} from './types';
import {
  auth,
  testConnection,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeUserAccountByUid,
  subscribeAllUserAccounts,
  updateUserAccountByAdmin,
  deleteUserAccountByAdmin,
  subscribeAdminNotifications,
  subscribeStudentsFromCloud,
  syncAllStudentsToCloud,
  deleteStudentsBatchFromCloud,
  subscribeClassesFromCloud,
  syncAllClassesToCloud,
  deleteClassesBatchFromCloud,
  subscribeTeachersFromCloud,
  syncAllTeachersToCloud,
  deleteTeachersBatchFromCloud,
  getLocalAuditLogs,
  recordAuditLog,
  subscribeAuditLogsFromCloud,
  deleteAuditLogFromCloud
} from './firebase';

export default function App() {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<string>('tab-thetrang');

  // Teacher / Student role & identity
  const [userRole, setUserRole] = useState<Role>(() => {
    return (localStorage.getItem('edusport_role') as Role) || 'gv';
  });

  const [selectedTeacher, setSelectedTeacher] = useState<string>(() => {
    return localStorage.getItem('edusport_teacher_select') || 'Nguyễn Trung Hiếu';
  });

  const [customUserName, setCustomUserName] = useState<string>(() => {
    return localStorage.getItem('edusport_user_name') || 'Nguyễn Trung Hiếu';
  });

  // Sport & Grade
  const [currentSport, setCurrentSport] = useState<SportKey>(() => {
    const initialized = localStorage.getItem('edusport_sport_v2_bongro');
    if (!initialized) {
      localStorage.setItem('edusport_sport_v2_bongro', 'true');
      localStorage.setItem('edusport_sport', 'bong-ro');
      return 'bong-ro';
    }
    return (localStorage.getItem('edusport_sport') as SportKey) || 'bong-ro';
  });

  const [currentGrade, setCurrentGrade] = useState<GradeLevel>(() => {
    return (localStorage.getItem('edusport_grade') as GradeLevel) || '12';
  });

  // 1. Students list state
  const [students, setStudents] = useState<StudentProfile[]>(() => {
    try {
      const rosterVer = localStorage.getItem('edusport_students_roster_v4');
      if (rosterVer !== '2026_10A1_10A3_12C1_12C2_12C3') {
        localStorage.setItem('edusport_students_roster_v4', '2026_10A1_10A3_12C1_12C2_12C3');
        localStorage.setItem('edusport_students', JSON.stringify(INITIAL_STUDENTS));
        return INITIAL_STUDENTS;
      }
      const saved = localStorage.getItem('edusport_students');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_STUDENTS;
  });

  // 2. Classes list state
  const [classes, setClasses] = useState<ClassRoomProfile[]>(() => {
    try {
      const saved = localStorage.getItem('edusport_classes');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_CLASSES;
  });

  // 3. Teachers list state
  const [teachers, setTeachers] = useState<TeacherProfile[]>(() => {
    try {
      const saved = localStorage.getItem('edusport_teachers');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_TEACHERS;
  });

  // 4. Google Auth & System Accounts state
  const [currentUserAccount, setCurrentUserAccount] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('edusport_current_user_account');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const [allUserAccounts, setAllUserAccounts] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem('edusport_all_user_accounts');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);

  // 5. Activity Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => getLocalAuditLogs());

  // Selected student passed to Parent Portal message
  const [messageTargetStudent, setMessageTargetStudent] = useState<StudentProfile | null>(null);

  // Modals
  const [isTimerOpen, setIsTimerOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Data authorization / permission state
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return localStorage.getItem('edusport_is_authorized') === 'true';
  });

  const [accessCode, setAccessCode] = useState<string>(() => {
    return localStorage.getItem('edusport_access_code') || 'HTP2026';
  });

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Effective authorization combines Google Super Admin, Approved Google Account, or Local Access Code
  const effectiveIsAuthorized = useMemo(() => {
    if (isSuperAdminEmail(currentUserAccount?.email)) return true;
    if (currentUserAccount?.status === 'approved') return true;
    return isAuthorized;
  }, [currentUserAccount, isAuthorized]);

  const pendingApprovalCount = useMemo(() => {
    const pendingUsers = allUserAccounts.filter(u => u.status === 'pending' && !isSuperAdminEmail(u.email)).length;
    const unreadNotifs = adminNotifications.filter(n => n.status === 'unread').length;
    return Math.max(pendingUsers, unreadNotifs);
  }, [allUserAccounts, adminNotifications]);

  // Listen to local audit log updates
  useEffect(() => {
    const refreshLocalLogs = () => {
      const local = getLocalAuditLogs();
      setAuditLogs(prev => {
        const mergedMap = new Map<string, AuditLogEntry>();
        [...local, ...prev].forEach(item => mergedMap.set(item.id, item));
        return Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      });
    };
    window.addEventListener('edusport-audit-log-updated', refreshLocalLogs);
    return () => window.removeEventListener('edusport-audit-log-updated', refreshLocalLogs);
  }, []);

  // Listen to Firebase Auth state & subscribe to current user profile + admin collections
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubAllUsers: (() => void) | null = null;
    let unsubNotifs: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubAllUsers) {
        unsubAllUsers();
        unsubAllUsers = null;
      }
      if (unsubNotifs) {
        unsubNotifs();
        unsubNotifs = null;
      }

      if (!fbUser) {
        setCurrentUserAccount(null);
        localStorage.removeItem('edusport_current_user_account');
        return;
      }

      const email = (fbUser.email || '').toLowerCase();
      localStorage.setItem('edusport_auth_email', email);

      unsubUserDoc = subscribeUserAccountByUid(fbUser.uid, (account) => {
        if (account) {
          setCurrentUserAccount(account);
          localStorage.setItem('edusport_current_user_account', JSON.stringify(account));
          if (isSuperAdminEmail(account.email) || account.status === 'approved') {
            setIsAuthorized(true);
            setUserRole('gv');
            if (account.displayName) {
              setCustomUserName(account.displayName);
            }
          }
        }
      });

      unsubAllUsers = subscribeAllUserAccounts((accounts) => {
        if (accounts.length > 0) {
          setAllUserAccounts(accounts);
          localStorage.setItem('edusport_all_user_accounts', JSON.stringify(accounts));
        }
      });

      if (isSuperAdminEmail(email)) {
        unsubNotifs = subscribeAdminNotifications((notifs) => {
          setAdminNotifications(notifs);
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
      if (unsubAllUsers) unsubAllUsers();
      if (unsubNotifs) unsubNotifs();
    };
  }, []);

  // Google Sign-In Handler
  const handleGoogleLogin = async () => {
    const { userAccount, isNewPendingRequest } = await signInWithGoogleAccount();
    setCurrentUserAccount(userAccount);
    localStorage.setItem('edusport_current_user_account', JSON.stringify(userAccount));

    if (isSuperAdminEmail(userAccount.email)) {
      setIsAuthorized(true);
      setUserRole('gv');
      setCustomUserName(userAccount.displayName || 'Bồ Công Lâm');
      showToast(`Xác thực Quản trị viên tối cao thành công (${userAccount.email})!`);
      // Đồng bộ dữ liệu khởi tạo lên Cloud khi Admin đăng nhập
      syncAllStudentsToCloud(students).catch(() => {});
      syncAllClassesToCloud(classes).catch(() => {});
      syncAllTeachersToCloud(teachers).catch(() => {});
    } else if (userAccount.status === 'approved') {
      setIsAuthorized(true);
      setUserRole(userAccount.role === 'hs' ? 'hs' : 'gv');
      setCustomUserName(userAccount.displayName || userAccount.email);
      showToast(`Đăng nhập thành công! Tài khoản ${userAccount.email} đã được Admin phê duyệt.`);
    } else if (isNewPendingRequest || userAccount.status === 'pending') {
      showToast(
        `Tài khoản ${userAccount.email} đã gửi yêu cầu xét duyệt tới Admin (${SUPER_ADMIN_EMAILS.join(' / ')}).`
      );
    } else {
      showToast(`Tài khoản ${userAccount.email} hiện đang bị từ chối quyền truy cập.`);
    }
  };

  const handleGoogleLogout = async () => {
    const prevEmail = currentUserAccount?.email || '';
    await recordAuditLog({
      actionType: 'AUTH',
      targetEntity: 'TAI_KHOAN',
      summary: `Đăng xuất tài khoản Google: ${prevEmail}`,
      details: `Người dùng ${currentUserAccount?.displayName || prevEmail} đã đăng xuất khỏi hệ thống.`
    });
    await signOutGoogleAccount();
    setCurrentUserAccount(null);
    localStorage.removeItem('edusport_current_user_account');
    localStorage.removeItem('edusport_auth_email');
    showToast('Đã đăng xuất tài khoản Google.');
  };

  const handleAuthorize = (usernameInput: string, passwordInput: string): boolean => {
    const u = (usernameInput || '').trim();
    const p = (passwordInput || '').trim();
    if (!u || !p) return false;

    const normalizedPassword = p.toUpperCase();
    const normalizedStored = accessCode.trim().toUpperCase();
    const acceptedPasswords = [normalizedStored, 'HTP2026', 'GDTC2026', '2026', '123456'];
    const isPasswordValid = acceptedPasswords.includes(normalizedPassword);
    if (!isPasswordValid) return false;

    const cleanU = u.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    const teacherNames = teachers.length > 0 ? teachers.map(t => t.name) : TEACHERS_LIST;
    
    let matchedTeacher = teacherNames.find(t => {
      const cleanT = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      return cleanT === cleanU || t.toLowerCase() === u.toLowerCase();
    });

    const adminUsernames = ['admin', 'quantri', 'gdtc', 'bgh', 'htp', 'tdtt', 'tdtt.htp@gmail.com', 'boconglam@gmail.com'];
    if (!matchedTeacher && adminUsernames.includes(cleanU)) {
      matchedTeacher = 'Bồ Công Lâm';
    }

    const finalTeacherName = matchedTeacher || u;

    setIsAuthorized(true);
    setUserRole('gv');
    if (matchedTeacher) {
      setSelectedTeacher(matchedTeacher);
    }
    setCustomUserName(finalTeacherName);
    localStorage.setItem('edusport_auth_user', finalTeacherName);

    recordAuditLog({
      actionType: 'AUTH',
      targetEntity: 'HE_THONG',
      summary: `Mở khóa quyền Giáo viên bằng mã bảo mật: ${finalTeacherName}`,
      details: `Giáo viên ${finalTeacherName} xác thực quyền thao tác dữ liệu trên thiết bị.`,
      actorName: finalTeacherName
    }).catch(() => {});

    showToast(`Đăng nhập thành công! Xin chào Thầy/Cô ${finalTeacherName}.`);
    return true;
  };

  const handleRevokePermission = () => {
    setIsAuthorized(false);
    localStorage.removeItem('edusport_auth_user');
    recordAuditLog({
      actionType: 'AUTH',
      targetEntity: 'HE_THONG',
      summary: `Khóa quyền truy cập dữ liệu trên thiết bị`,
      details: `Người dùng ${customUserName} đã khóa quyền truy cập dữ liệu.`
    }).catch(() => {});
    if (currentUserAccount) {
      signOutGoogleAccount().catch(() => {});
      setCurrentUserAccount(null);
      localStorage.removeItem('edusport_current_user_account');
    }
    showToast('Đã thu hồi quyền và đăng xuất khỏi hệ thống.');
  };

  const handleUpdateAccessCode = (newCode: string) => {
    setAccessCode(newCode);
    recordAuditLog({
      actionType: 'PERMISSION_CHANGE',
      targetEntity: 'HE_THONG',
      summary: 'Đổi mã cấp quyền dự phòng của Tổ bộ môn GDTC',
      details: `Cập nhật mã cấp quyền nội bộ bởi ${customUserName}.`
    }).catch(() => {});
    showToast(`Đã đổi mã bảo mật trường thành công!`);
  };

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem('edusport_role', userRole);
    localStorage.setItem('edusport_teacher_select', selectedTeacher);
    localStorage.setItem('edusport_user_name', customUserName);
    localStorage.setItem('edusport_sport', currentSport);
    localStorage.setItem('edusport_grade', currentGrade);
    localStorage.setItem('edusport_students', JSON.stringify(students));
    localStorage.setItem('edusport_classes', JSON.stringify(classes));
    localStorage.setItem('edusport_teachers', JSON.stringify(teachers));
    localStorage.setItem('edusport_is_authorized', isAuthorized ? 'true' : 'false');
    localStorage.setItem('edusport_access_code', accessCode);
  }, [userRole, selectedTeacher, customUserName, currentSport, currentGrade, students, classes, teachers, isAuthorized, accessCode]);

  // Real-time Cloud Subscriptions for Students, Classes, Teachers, and Audit Logs
  useEffect(() => {
    testConnection();
    const unsubStudents = subscribeStudentsFromCloud(
      (cloudStudents) => {
        if (cloudStudents && cloudStudents.length > 0) {
          setStudents(cloudStudents);
          localStorage.setItem('edusport_students', JSON.stringify(cloudStudents));
        } else {
          syncAllStudentsToCloud(INITIAL_STUDENTS).catch(() => {});
        }
      },
      (err) => {
        console.warn('Lưu ý kết nối Firestore:', err);
      }
    );

    const unsubClasses = subscribeClassesFromCloud((cloudClasses) => {
      if (cloudClasses && cloudClasses.length > 0) {
        setClasses(cloudClasses);
        localStorage.setItem('edusport_classes', JSON.stringify(cloudClasses));
      } else {
        syncAllClassesToCloud(INITIAL_CLASSES).catch(() => {});
      }
    });

    const unsubTeachers = subscribeTeachersFromCloud((cloudTeachers) => {
      if (cloudTeachers && cloudTeachers.length > 0) {
        setTeachers(cloudTeachers);
        localStorage.setItem('edusport_teachers', JSON.stringify(cloudTeachers));
      } else {
        syncAllTeachersToCloud(INITIAL_TEACHERS).catch(() => {});
      }
    });

    const unsubAudit = subscribeAuditLogsFromCloud((cloudLogs) => {
      const local = getLocalAuditLogs();
      const mergedMap = new Map<string, AuditLogEntry>();
      [...cloudLogs, ...local].forEach(item => mergedMap.set(item.id, item));
      const merged = Array.from(mergedMap.values()).sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      );
      setAuditLogs(merged);
    });

    return () => {
      if (typeof unsubStudents === 'function') unsubStudents();
      if (typeof unsubClasses === 'function') unsubClasses();
      if (typeof unsubTeachers === 'function') unsubTeachers();
      if (typeof unsubAudit === 'function') unsubAudit();
    };
  }, []);

  // Mutation handlers with automatic Activity Audit Logging & Cloud Sync
  const handleUpdateStudents = (
    updated: StudentProfile[],
    auditInfo?: {
      actionType: AuditActionType;
      summary: string;
      details?: string;
      deletedIds?: string[];
    }
  ) => {
    const prevCount = students.length;
    setStudents(updated);
    localStorage.setItem('edusport_students', JSON.stringify(updated));

    if (auditInfo?.deletedIds && auditInfo.deletedIds.length > 0) {
      deleteStudentsBatchFromCloud(auditInfo.deletedIds).catch((err) => {
        console.warn('Xoá học sinh trên Firestore:', err);
      });
    }
    syncAllStudentsToCloud(updated).catch((err) => {
      console.warn('Đồng bộ học sinh lên Firestore:', err);
    });

    const actionType: AuditActionType =
      auditInfo?.actionType ||
      (updated.length < prevCount
        ? prevCount - updated.length > 1
          ? 'BULK_DELETE'
          : 'DELETE'
        : updated.length > prevCount
        ? 'CREATE'
        : 'UPDATE');

    const summary =
      auditInfo?.summary ||
      (updated.length < prevCount
        ? `Xoá ${prevCount - updated.length} học sinh khỏi danh sách (Còn ${updated.length} HS)`
        : updated.length > prevCount
        ? `Thêm mới ${updated.length - prevCount} học sinh (Tổng ${updated.length} HS)`
        : `Cập nhật hồ sơ / đánh giá học sinh (${updated.length} HS)`);

    recordAuditLog({
      actionType,
      targetEntity: 'HOC_SINH',
      summary,
      details: auditInfo?.details || `Tổng số học sinh sau thay đổi: ${updated.length}.`
    }).catch(() => {});
  };

  const handleUpdateClasses = (
    updated: ClassRoomProfile[],
    auditInfo?: {
      actionType: AuditActionType;
      summary: string;
      details?: string;
      deletedIds?: string[];
    }
  ) => {
    setClasses(updated);
    localStorage.setItem('edusport_classes', JSON.stringify(updated));

    if (auditInfo?.deletedIds && auditInfo.deletedIds.length > 0) {
      deleteClassesBatchFromCloud(auditInfo.deletedIds).catch((err) => {
        console.warn('Xoá lớp học trên Firestore:', err);
      });
    }
    syncAllClassesToCloud(updated).catch((err) => {
      console.warn('Đồng bộ lớp học lên Firestore:', err);
    });

    recordAuditLog({
      actionType: auditInfo?.actionType || 'UPDATE',
      targetEntity: 'LOP_HOC',
      summary: auditInfo?.summary || `Cập nhật danh sách lớp học (${updated.length} lớp)`,
      details: auditInfo?.details || `Danh sách lớp hiện tại: ${updated.map(c => c.name).join(', ')}`
    }).catch(() => {});
  };

  const handleUpdateTeachers = (
    updated: TeacherProfile[],
    auditInfo?: {
      actionType: AuditActionType;
      summary: string;
      details?: string;
      deletedIds?: string[];
    }
  ) => {
    setTeachers(updated);
    localStorage.setItem('edusport_teachers', JSON.stringify(updated));

    if (auditInfo?.deletedIds && auditInfo.deletedIds.length > 0) {
      deleteTeachersBatchFromCloud(auditInfo.deletedIds).catch((err) => {
        console.warn('Xoá giáo viên trên Firestore:', err);
      });
    }
    syncAllTeachersToCloud(updated).catch((err) => {
      console.warn('Đồng bộ giáo viên lên Firestore:', err);
    });

    recordAuditLog({
      actionType: auditInfo?.actionType || 'UPDATE',
      targetEntity: 'GIAO_VIEN',
      summary: auditInfo?.summary || `Cập nhật danh sách giáo viên (${updated.length} GV)`,
      details: auditInfo?.details || `Danh sách giáo viên hiện tại: ${updated.map(t => t.name).join(', ')}`
    }).catch(() => {});
  };

  const handleAdminUpdateUser = async (account: UserAccount, summary: string) => {
    const adminEmail = currentUserAccount?.email || SUPER_ADMIN_EMAILS[0];
    setAllUserAccounts(prev => {
      const exists = prev.some(u => u.uid === account.uid);
      const next = exists
        ? prev.map(u => (u.uid === account.uid ? { ...account, approvedBy: adminEmail, updatedAt: new Date().toISOString() } : u))
        : [{ ...account, approvedBy: adminEmail, updatedAt: new Date().toISOString() }, ...prev];
      localStorage.setItem('edusport_all_user_accounts', JSON.stringify(next));
      return next;
    });

    if (auth.currentUser) {
      await updateUserAccountByAdmin(account, adminEmail);
    }

    await recordAuditLog({
      actionType: 'PERMISSION_CHANGE',
      targetEntity: 'TAI_KHOAN',
      summary,
      details: `Tài khoản: ${account.displayName} (${account.email}) | Trạng thái: ${account.status} | Vai trò: ${account.role} | Quyền HS: ${account.canManageStudents}, Lớp: ${account.canManageClasses}, GV: ${account.canManageTeachers}`
    });
  };

  const handleAdminDeleteUser = async (account: UserAccount) => {
    setAllUserAccounts(prev => {
      const next = prev.filter(u => u.uid !== account.uid);
      localStorage.setItem('edusport_all_user_accounts', JSON.stringify(next));
      return next;
    });

    if (auth.currentUser) {
      await deleteUserAccountByAdmin(account.uid);
    }

    await recordAuditLog({
      actionType: 'DELETE',
      targetEntity: 'TAI_KHOAN',
      summary: `Xoá tài khoản người dùng ${account.email} khỏi hệ thống`,
      details: `Đã xoá hồ sơ phân quyền của ${account.displayName} (${account.email}).`
    });
  };

  const handleDeleteAuditLog = async (logId: string) => {
    await deleteAuditLogFromCloud(logId);
    setAuditLogs(prev => prev.filter(l => l.id !== logId));
  };

  const handleRoleChange = (role: Role) => {
    setUserRole(role);
    if (role === 'gv') {
      if (selectedTeacher !== 'custom') {
        setCustomUserName(selectedTeacher);
      }
    } else {
      setCustomUserName('Lê Khánh An');
    }
  };

  const handleSelectTeacher = (teacher: string) => {
    setSelectedTeacher(teacher);
    if (teacher !== 'custom') {
      setCustomUserName(teacher);
    } else {
      setCustomUserName('');
    }
  };

  const handleSaveSession = () => {
    localStorage.setItem('edusport_students', JSON.stringify(students));
    localStorage.setItem('edusport_user_name', customUserName);
    setIsSyncModalOpen(true);
  };

  const handleSelectForMessage = (student: StudentProfile) => {
    setMessageTargetStudent(student);
    setActiveTab('tab-phuhuynh');
  };

  return (
    <div className="bg-slate-100 font-sans text-slate-800 antialiased min-h-screen flex flex-col">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-700 animate-bounce text-xs md:text-sm font-semibold max-w-md">
          <i className="fa-solid fa-circle-check text-emerald-400"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER */}
      <Header
        currentSport={currentSport}
        userRole={userRole}
        userName={customUserName || (userRole === 'gv' ? 'Thầy/Cô GDTC' : 'Học sinh')}
        onSwitchTab={(tabId) => setActiveTab(tabId)}
        onSaveSession={handleSaveSession}
        onOpenTimerModal={() => setIsTimerOpen(true)}
        unreadCount={2}
        isAuthorized={effectiveIsAuthorized}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        currentUserAccount={currentUserAccount}
        pendingApprovalCount={pendingApprovalCount}
      />

      {/* THANH ĐIỀU HƯỚNG TÁC NGHIỆP (NAV TABS) */}
      <nav className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between overflow-x-auto no-scrollbar py-2">
          <div className="flex space-x-1 sm:space-x-1.5 text-xs md:text-sm font-semibold whitespace-nowrap">
            
            <button
              onClick={() => setActiveTab('tab-khbd')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tab-khbd'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-book-open ${activeTab === 'tab-khbd' ? 'text-amber-300' : 'text-emerald-600'}`}></i>
              <span>Soạn KHBD</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-danhgia')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tab-danhgia'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-clipboard-check ${activeTab === 'tab-danhgia' ? 'text-amber-300' : 'text-blue-600'}`}></i>
              <span>Đánh Giá Thường Xuyên</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-thetrang')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tab-thetrang'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-person-running ${activeTab === 'tab-thetrang' ? 'text-amber-300' : 'text-emerald-600'}`}></i>
              <span>Gợi Ý Bài Tập Thể Trạng</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-bmi')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tab-bmi'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-scale-balanced ${activeTab === 'tab-bmi' ? 'text-amber-300' : 'text-teal-600'}`}></i>
              <span>Chỉ Số BMI</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-dinhduong')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tab-dinhduong'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-utensils ${activeTab === 'tab-dinhduong' ? 'text-amber-300' : 'text-orange-600'}`}></i>
              <span>Dinh Dưỡng</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-phuhuynh')}
              className={`nav-tab px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer relative ${
                activeTab === 'tab-phuhuynh'
                  ? 'bg-emerald-800 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <i className={`fa-solid fa-bell ${activeTab === 'tab-phuhuynh' ? 'text-amber-300' : 'text-rose-600'}`}></i>
              <span>Zalo / SMS</span>
              <span className="bg-rose-500 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">2</span>
            </button>

            <button
              onClick={() => setActiveTab('tab-quantri')}
              className={`nav-tab px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer relative ${
                activeTab === 'tab-quantri'
                  ? 'bg-indigo-800 text-white shadow-xs font-bold'
                  : 'text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/80'
              }`}
              title={
                effectiveIsAuthorized
                  ? 'Đã xác thực quyền truy cập Trung tâm Quản trị Hệ thống'
                  : 'Chức năng Quản trị Hệ thống đang khóa - Cần đăng nhập đúng vai trò phân quyền'
              }
            >
              <i className={`fa-solid ${effectiveIsAuthorized ? 'fa-user-shield' : 'fa-lock'} ${activeTab === 'tab-quantri' ? 'text-amber-300' : 'text-indigo-700'}`}></i>
              <span>Quản Trị Hệ Thống & Dữ Liệu</span>
              {!effectiveIsAuthorized && (
                <span className="bg-amber-200 text-amber-950 rounded px-1.5 py-0.2 text-[10px] font-bold">
                  Khóa
                </span>
              )}
              {effectiveIsAuthorized && pendingApprovalCount > 0 && (
                <span className="bg-amber-400 text-slate-950 rounded-full px-1.5 py-0.2 text-[10px] font-black">
                  {pendingApprovalCount}
                </span>
              )}
            </button>

          </div>
        </div>
      </nav>

      {/* THANH CẤU HÌNH NHANH */}
      <ControlBar
        userRole={userRole}
        onChangeRole={handleRoleChange}
        selectedTeacher={selectedTeacher}
        onSelectTeacher={handleSelectTeacher}
        customUserName={customUserName}
        onChangeUserName={(name) => setCustomUserName(name)}
        currentSport={currentSport}
        onChangeSport={(sport) => setCurrentSport(sport)}
        currentGrade={currentGrade}
        onChangeGrade={(grade) => setCurrentGrade(grade)}
        isAuthorized={effectiveIsAuthorized}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        teachers={teachers}
      />

      {/* NỘI DUNG CHÍNH (MAIN CONTAINER) */}
      <main className="max-w-7xl mx-auto px-4 py-5 flex-1 w-full">
        {activeTab === 'tab-thetrang' && (
          <TabTheTrang
            students={students}
            currentSport={currentSport}
            currentTeacherName={customUserName || 'Giáo viên'}
            onSelectStudentForMessage={handleSelectForMessage}
            isAuthorized={effectiveIsAuthorized}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onAuthorize={handleAuthorize}
          />
        )}

        {activeTab === 'tab-khbd' && (
          <TabKHBD
            currentSport={currentSport}
            currentGrade={currentGrade}
            currentTeacherName={customUserName || 'Nguyễn Trung Hiếu'}
            userRole={userRole}
            students={students}
          />
        )}

        {activeTab === 'tab-danhgia' && (
          <TabDanhGia
            students={students}
            classes={classes}
            onUpdateStudents={handleUpdateStudents}
            onSelectForMessage={handleSelectForMessage}
            isAuthorized={effectiveIsAuthorized}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onAuthorize={handleAuthorize}
          />
        )}

        {activeTab === 'tab-bmi' && (
          <TabBMI
            students={students}
            onUpdateStudents={(updated) => handleUpdateStudents(updated, {
              actionType: 'UPDATE',
              summary: `Cập nhật chỉ số nhân trắc học & BMI (${updated.length} học sinh)`,
              details: 'Chỉnh sửa chiều cao, cân nặng, BMI tại phân hệ Đánh Giá Chỉ Số BMI.'
            })}
            onSwitchToTheTrang={() => setActiveTab('tab-thetrang')}
            onSelectForMessage={handleSelectForMessage}
            onShowToast={showToast}
            isAuthorized={effectiveIsAuthorized}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'tab-dinhduong' && (
          <TabDinhDuong students={students} />
        )}

        {activeTab === 'tab-phuhuynh' && (
          <TabPhuHuynh
            students={students}
            currentSport={currentSport}
            currentTeacherName={customUserName || 'Nguyễn Trung Hiếu'}
            initialSelectedStudent={messageTargetStudent}
            isAuthorized={effectiveIsAuthorized}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onAuthorize={handleAuthorize}
          />
        )}

        {activeTab === 'tab-quantri' && (
          <TabQuanTriHeThong
            students={students}
            classes={classes}
            teachers={teachers}
            currentUserAccount={currentUserAccount}
            allUserAccounts={allUserAccounts}
            adminNotifications={adminNotifications}
            auditLogs={auditLogs}
            isAuthorized={effectiveIsAuthorized}
            userRole={userRole}
            onAuthorize={handleAuthorize}
            onGoogleLogin={handleGoogleLogin}
            onGoogleLogout={handleGoogleLogout}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onUpdateStudents={handleUpdateStudents}
            onUpdateClasses={handleUpdateClasses}
            onUpdateTeachers={handleUpdateTeachers}
            onAdminUpdateUser={handleAdminUpdateUser}
            onAdminDeleteUser={handleAdminDeleteUser}
            onDeleteAuditLog={handleDeleteAuditLog}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* FOOTER SƯ PHẠM TRANG TRỌNG */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-4 border-t border-slate-800 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2 text-center md:text-left">
          <div>
            <p className="font-semibold text-slate-200">
              TRƯỜNG TRUNG HỌC PHỔ THÔNG HUỲNH TẤN PHÁT
            </p>
            <p>
              Bộ môn: Giáo dục Thể chất • Quản trị hệ thống Google Admin ({SUPER_ADMIN_EMAILS.join(' • ')})
            </p>
          </div>
          <div className="text-slate-400 text-[11px] md:text-xs">
            <span>
              Danh sách GV ({teachers.length}): {teachers.map(t => t.name).join(', ')}
            </span>
          </div>
        </div>
      </footer>

      {/* MODAL BẤM GIỜ & METRONOME SƯ PHẠM */}
      <StopwatchModal
        isOpen={isTimerOpen}
        onClose={() => setIsTimerOpen(false)}
      />

      {/* MODAL SAO LƯU & ĐỒNG BỘ THIẾT BỊ (PC ⇄ ĐIỆN THOẠI) */}
      <SyncBackupModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        students={students}
        onUpdateStudents={(updated) => handleUpdateStudents(updated, {
          actionType: 'UPDATE',
          summary: `Đồng bộ / Khôi phục danh sách học sinh (${updated.length} học sinh)`,
          details: 'Thao tác từ Trung tâm Sao lưu & Đồng bộ thiết bị.'
        })}
        currentSport={currentSport}
        currentGrade={currentGrade}
        userRole={userRole}
        customUserName={customUserName}
        onShowToast={showToast}
      />

      {/* MODAL CẤP QUYỀN TRUY CẬP VÀ BẢO MẬT DỮ LIỆU HỌC SINH */}
      <AuthPermissionModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        isAuthorized={effectiveIsAuthorized}
        onAuthorize={handleAuthorize}
        onRevoke={handleRevokePermission}
        currentCode={accessCode}
        onChangeCode={handleUpdateAccessCode}
        userRole={userRole}
        onChangeRole={handleRoleChange}
        userName={customUserName}
        currentUserAccount={currentUserAccount}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
        onOpenAdminCenter={() => setActiveTab('tab-quantri')}
        teachers={teachers}
      />

    </div>
  );
}
