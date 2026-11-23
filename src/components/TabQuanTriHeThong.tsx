import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  StudentProfile,
  ClassRoomProfile,
  TeacherProfile,
  UserAccount,
  UserAccountRole,
  UserAccountStatus,
  AdminNotification,
  AuditLogEntry,
  GradeLevel
} from '../types';
import { SUPER_ADMIN_EMAILS, isSuperAdminEmail, INITIAL_CLASSES, INITIAL_TEACHERS } from '../data/schoolData';
import { INITIAL_STUDENTS } from '../data/students';
import { ImportStudentsModal } from './ImportStudentsModal';
import { EditStudentModal } from './EditStudentModal';
import { sanitizeFirestoreId } from '../firebase';

interface TabQuanTriHeThongProps {
  students: StudentProfile[];
  classes: ClassRoomProfile[];
  teachers: TeacherProfile[];
  currentUserAccount: UserAccount | null;
  allUserAccounts: UserAccount[];
  adminNotifications: AdminNotification[];
  auditLogs: AuditLogEntry[];
  isAuthorized: boolean;
  userRole: 'gv' | 'hs';
  onAuthorize?: (username: string, password: string) => boolean;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onOpenAuthModal: () => void;
  onUpdateStudents: (students: StudentProfile[], auditInfo?: { actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'IMPORT_EXCEL'; summary: string; details?: string; deletedIds?: string[] }) => void;
  onUpdateClasses: (classes: ClassRoomProfile[], auditInfo?: { actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'IMPORT_EXCEL'; summary: string; details?: string; deletedIds?: string[] }) => void;
  onUpdateTeachers: (teachers: TeacherProfile[], auditInfo?: { actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_DELETE' | 'IMPORT_EXCEL'; summary: string; details?: string; deletedIds?: string[] }) => void;
  onAdminUpdateUser: (account: UserAccount, summary: string) => Promise<void>;
  onAdminDeleteUser: (account: UserAccount) => Promise<void>;
  onDeleteAuditLog?: (logId: string) => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const TabQuanTriHeThong: React.FC<TabQuanTriHeThongProps> = ({
  students,
  classes,
  teachers,
  currentUserAccount,
  allUserAccounts,
  adminNotifications,
  auditLogs,
  isAuthorized,
  userRole,
  onAuthorize,
  onGoogleLogin,
  onGoogleLogout,
  onOpenAuthModal,
  onUpdateStudents,
  onUpdateClasses,
  onUpdateTeachers,
  onAdminUpdateUser,
  onAdminDeleteUser,
  onDeleteAuditLog,
  onShowToast
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'students' | 'classes' | 'teachers' | 'rbac' | 'audit'>('students');
  const [gateUsername, setGateUsername] = useState<string>('');
  const [gatePassword, setGatePassword] = useState<string>('');
  const [gateError, setGateError] = useState<string>('');

  // Quyền hạn hiện tại theo đúng vai trò phân quyền
  const isSuperAdmin = useMemo(() => {
    return (
      isSuperAdminEmail(currentUserAccount?.email) ||
      (currentUserAccount?.role === 'admin' && currentUserAccount?.status === 'approved')
    );
  }, [currentUserAccount]);

  const isApprovedGoogleUser = useMemo(() => {
    return Boolean(
      currentUserAccount &&
      currentUserAccount.status === 'approved' &&
      currentUserAccount.role !== 'hs'
    );
  }, [currentUserAccount]);

  // Chỉ sử dụng được chức năng Quản trị hệ thống khi đã đăng nhập đúng vai trò phân quyền (Super Admin, Tài khoản Google đã được Admin phê duyệt, hoặc Giáo viên đã xác thực mã bảo mật) và không ở vai trò Học sinh
  const hasSystemAdminPortalAccess = useMemo(() => {
    if (userRole === 'hs') return false;
    if (isSuperAdmin) return true;
    if (isApprovedGoogleUser) return true;
    if (!currentUserAccount && isAuthorized) return true;
    return false;
  }, [userRole, isSuperAdmin, isApprovedGoogleUser, currentUserAccount, isAuthorized]);

  const canManageStudents = useMemo(() => {
    if (!hasSystemAdminPortalAccess) return false;
    if (isSuperAdmin) return true;
    if (currentUserAccount) {
      return currentUserAccount.status === 'approved' && currentUserAccount.role !== 'viewer' && Boolean(currentUserAccount.canManageStudents);
    }
    return isAuthorized;
  }, [hasSystemAdminPortalAccess, isSuperAdmin, currentUserAccount, isAuthorized]);

  const canManageClasses = useMemo(() => {
    if (!hasSystemAdminPortalAccess) return false;
    if (isSuperAdmin) return true;
    if (currentUserAccount) {
      return currentUserAccount.status === 'approved' && currentUserAccount.role !== 'viewer' && Boolean(currentUserAccount.canManageClasses);
    }
    return isAuthorized;
  }, [hasSystemAdminPortalAccess, isSuperAdmin, currentUserAccount, isAuthorized]);

  const canManageTeachers = useMemo(() => {
    if (!hasSystemAdminPortalAccess) return false;
    if (isSuperAdmin) return true;
    if (currentUserAccount) {
      return currentUserAccount.status === 'approved' && currentUserAccount.role !== 'viewer' && Boolean(currentUserAccount.canManageTeachers);
    }
    return false; // Tài khoản mã nội bộ thường chỉ quản lý học sinh & lớp học, quản lý danh sách GV & Phân quyền yêu cầu Admin hoặc được cấp quyền rõ ràng
  }, [hasSystemAdminPortalAccess, isSuperAdmin, currentUserAccount]);

  const canManageUsersAndRbac = useMemo(() => {
    if (!hasSystemAdminPortalAccess) return false;
    return isSuperAdmin || Boolean(currentUserAccount?.status === 'approved' && currentUserAccount?.canManageUsers);
  }, [hasSystemAdminPortalAccess, isSuperAdmin, currentUserAccount]);

  // =========================================================
  // STATE 1: QUẢN LÝ HỌC SINH (EXCEL & XOÁ HÀNG LOẠT)
  // =========================================================
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isImportStudentsOpen, setIsImportStudentsOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);
  const [confirmDeleteStudentIds, setConfirmDeleteStudentIds] = useState<string[] | null>(null);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (studentClassFilter !== 'all' && s.class !== studentClassFilter) return false;
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase().trim();
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.class.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [students, studentClassFilter, studentSearch]);

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllStudents = () => {
    const currentIds = filteredStudents.map(s => s.id);
    const allSelected = currentIds.length > 0 && currentIds.every(id => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds(prev => prev.filter(id => !currentIds.includes(id)));
    } else {
      setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...currentIds])));
    }
  };

  const executeBulkDeleteStudents = (idsToDelete: string[]) => {
    if (!canManageStudents) {
      onShowToast('Tài khoản của bạn chưa được Admin cấp quyền xoá dữ liệu học sinh!');
      return;
    }
    const deletedNames = students
      .filter(s => idsToDelete.includes(s.id))
      .map(s => `${s.name} (${s.class})`)
      .slice(0, 15)
      .join(', ');
    const remaining = students.filter(s => !idsToDelete.includes(s.id));
    onUpdateStudents(remaining, {
      actionType: idsToDelete.length > 1 ? 'BULK_DELETE' : 'DELETE',
      summary: `Xoá ${idsToDelete.length > 1 ? 'hàng loạt ' : ''}${idsToDelete.length} học sinh khỏi hệ thống`,
      details: `Danh sách xoá: ${deletedNames}${idsToDelete.length > 15 ? ` và ${idsToDelete.length - 15} học sinh khác` : ''}. Sĩ số còn lại: ${remaining.length} HS.`,
      deletedIds: idsToDelete
    });
    setSelectedStudentIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    setConfirmDeleteStudentIds(null);
    onShowToast(`Đã xoá thành công ${idsToDelete.length} học sinh!`);
  };

  const handleExportStudentsExcel = () => {
    const rows = [
      ['STT', 'Mã HS', 'Họ và tên', 'Lớp', 'Giới tính', 'Chiều cao (cm)', 'Cân nặng (kg)', 'BMI', 'Thể trạng', 'Ghi chú sức khỏe', 'SĐT Phụ huynh', 'Xếp loại TT22'],
      ...filteredStudents.map((st, idx) => [
        idx + 1,
        st.code,
        st.name,
        st.class,
        st.gender,
        st.heightCm,
        st.weightKg,
        st.bmi,
        st.status === 'overweight' ? 'Thừa cân' : st.status === 'underweight' ? 'Thiếu cân' : st.status === 'mild' ? 'Bệnh nền' : 'Chuẩn',
        st.medicalNote,
        st.parentPhone || '',
        st.rating
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Hoc_Sinh');
    XLSX.writeFile(wb, `Danh_Sach_Hoc_Sinh_${studentClassFilter === 'all' ? 'Toan_Truong' : studentClassFilter}.xlsx`);
  };

  // =========================================================
  // STATE 2: QUẢN LÝ LỚP HỌC (EXCEL & XOÁ HÀNG LOẠT)
  // =========================================================
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classNameInput, setClassNameInput] = useState<string>('');
  const [classGradeInput, setClassGradeInput] = useState<GradeLevel>('10');
  const [classHomeroomInput, setClassHomeroomInput] = useState<string>('');
  const [classPeTeacherInput, setClassPeTeacherInput] = useState<string>(teachers[0]?.name || 'Bồ Công Lâm');
  const [classSchoolYearInput, setClassSchoolYearInput] = useState<string>('2025 - 2026');
  const [classNoteInput, setClassNoteInput] = useState<string>('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classExcelPaste, setClassExcelPaste] = useState<string>('');
  const [showClassImportBox, setShowClassImportBox] = useState<boolean>(false);
  const [confirmDeleteClassIds, setConfirmDeleteClassIds] = useState<string[] | null>(null);

  const handleSaveClassForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageClasses) {
      onShowToast('Tài khoản của bạn chưa được cấp quyền cập nhật danh sách lớp học!');
      return;
    }
    const cleanName = classNameInput.trim().toUpperCase();
    if (!cleanName) return;

    if (editingClassId) {
      const updated = classes.map(c =>
        c.id === editingClassId
          ? {
              ...c,
              name: cleanName,
              grade: classGradeInput,
              homeroomTeacher: classHomeroomInput.trim(),
              peTeacher: classPeTeacherInput.trim(),
              schoolYear: classSchoolYearInput.trim(),
              note: classNoteInput.trim(),
              updatedAt: new Date().toISOString()
            }
          : c
      );
      onUpdateClasses(updated, {
        actionType: 'UPDATE',
        summary: `Cập nhật thông tin lớp học ${cleanName}`,
        details: `Lớp ${cleanName} (Khối ${classGradeInput}) - GVCN: ${classHomeroomInput} - GV GDTC: ${classPeTeacherInput}`
      });
      setEditingClassId(null);
      onShowToast(`Đã cập nhật thông tin lớp ${cleanName}!`);
    } else {
      const id = sanitizeFirestoreId(`class-${cleanName}`, 'class');
      const newCls: ClassRoomProfile = {
        id,
        name: cleanName,
        grade: classGradeInput,
        homeroomTeacher: classHomeroomInput.trim(),
        peTeacher: classPeTeacherInput.trim(),
        schoolYear: classSchoolYearInput.trim() || '2025 - 2026',
        note: classNoteInput.trim(),
        updatedAt: new Date().toISOString()
      };
      const exists = classes.some(c => c.name.toUpperCase() === cleanName);
      const updated = exists
        ? classes.map(c => (c.name.toUpperCase() === cleanName ? newCls : c))
        : [...classes, newCls];
      onUpdateClasses(updated, {
        actionType: exists ? 'UPDATE' : 'CREATE',
        summary: `${exists ? 'Cập nhật' : 'Thêm mới'} lớp học ${cleanName}`,
        details: `Lớp ${cleanName} (Khối ${classGradeInput}) - GVCN: ${newCls.homeroomTeacher} - GV GDTC: ${newCls.peTeacher}`
      });
      onShowToast(`Đã lưu lớp ${cleanName} vào hệ thống!`);
    }

    setClassNameInput('');
    setClassHomeroomInput('');
    setClassNoteInput('');
  };

  const parseClassesFromRows = (rows: any[][]): ClassRoomProfile[] => {
    const result: ClassRoomProfile[] = [];
    rows.forEach((r) => {
      const cols = r.map(x => String(x ?? '').trim());
      if (cols.every(x => !x)) return;
      const first = cols[0].toLowerCase();
      if (first.includes('tên lớp') || first === 'lớp' || first === 'stt') return;

      const name = (cols[0] || '').toUpperCase();
      if (!name) return;
      let grade: GradeLevel = '10';
      if (cols[1] === '11' || name.startsWith('11')) grade = '11';
      else if (cols[1] === '12' || name.startsWith('12')) grade = '12';

      result.push({
        id: sanitizeFirestoreId(`class-${name}`, 'class'),
        name: name.slice(0, 30),
        grade,
        homeroomTeacher: (cols[2] || '').slice(0, 100),
        peTeacher: (cols[3] || 'Bồ Công Lâm').slice(0, 100),
        schoolYear: (cols[4] || '2025 - 2026').slice(0, 30),
        note: (cols[5] || '').slice(0, 300),
        updatedAt: new Date().toISOString()
      });
    });
    return result;
  };

  const handleImportClassesExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        const imported = parseClassesFromRows(rows);
        if (imported.length === 0) {
          onShowToast('Không tìm thấy dòng dữ liệu lớp học hợp lệ trong tệp Excel!');
          return;
        }
        const mergedMap = new Map<string, ClassRoomProfile>();
        classes.forEach(c => mergedMap.set(c.name.toUpperCase(), c));
        imported.forEach(c => mergedMap.set(c.name.toUpperCase(), c));
        const merged = Array.from(mergedMap.values());
        onUpdateClasses(merged, {
          actionType: 'IMPORT_EXCEL',
          summary: `Nhập ${imported.length} lớp học từ tệp Excel (${file.name})`,
          details: `Các lớp đã nhập: ${imported.map(c => c.name).join(', ')}`
        });
        setShowClassImportBox(false);
        onShowToast(`Đã nhập thành công ${imported.length} lớp học từ Excel!`);
      } catch {
        onShowToast('Lỗi đọc tệp Excel danh sách lớp!');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportClassesFromPaste = () => {
    if (!classExcelPaste.trim()) return;
    const rows = classExcelPaste
      .trim()
      .split(/\r?\n/)
      .map(line => (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',')));
    const imported = parseClassesFromRows(rows);
    if (imported.length === 0) {
      onShowToast('Không nhận diện được dữ liệu lớp học hợp lệ!');
      return;
    }
    const mergedMap = new Map<string, ClassRoomProfile>();
    classes.forEach(c => mergedMap.set(c.name.toUpperCase(), c));
    imported.forEach(c => mergedMap.set(c.name.toUpperCase(), c));
    const merged = Array.from(mergedMap.values());
    onUpdateClasses(merged, {
      actionType: 'IMPORT_EXCEL',
      summary: `Nhập ${imported.length} lớp học bằng sao chép Excel`,
      details: `Các lớp đã nhập: ${imported.map(c => c.name).join(', ')}`
    });
    setClassExcelPaste('');
    setShowClassImportBox(false);
    onShowToast(`Đã nhập thành công ${imported.length} lớp học!`);
  };

  const handleDownloadClassExcelTemplate = () => {
    const rows = [
      ['Tên lớp', 'Khối (10/11/12)', 'Giáo viên chủ nhiệm', 'GV GDTC phụ trách', 'Năm học', 'Ghi chú chuyên môn'],
      ['10A1', '10', 'Nguyễn Văn Minh', 'Bồ Công Lâm', '2025 - 2026', 'Bóng rổ & Bóng chuyền'],
      ['10A2', '10', 'Trần Thị Mai', 'Nguyễn Tấn Phước', '2025 - 2026', 'Bóng chuyền & Cầu lông'],
      ['11B1', '11', 'Lê Hoàng Nam', 'Bùi Thanh Liêm', '2025 - 2026', 'Bóng rổ nâng cao'],
      ['12C1', '12', 'Phạm Thị Ngọc Du', 'Bồ Công Lâm', '2025 - 2026', 'Bóng rổ & Chiến thuật']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Lop');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Lop_THPT_HuynhTanPhat.xlsx');
  };

  const executeBulkDeleteClasses = (idsToDelete: string[]) => {
    if (!canManageClasses) {
      onShowToast('Tài khoản của bạn chưa được cấp quyền xoá lớp học!');
      return;
    }
    const deletedNames = classes.filter(c => idsToDelete.includes(c.id)).map(c => c.name).join(', ');
    const remaining = classes.filter(c => !idsToDelete.includes(c.id));
    onUpdateClasses(remaining, {
      actionType: idsToDelete.length > 1 ? 'BULK_DELETE' : 'DELETE',
      summary: `Xoá ${idsToDelete.length > 1 ? 'hàng loạt ' : ''}${idsToDelete.length} lớp học (${deletedNames})`,
      details: `Đã xoá các lớp: ${deletedNames}. Số lớp còn lại: ${remaining.length}.`,
      deletedIds: idsToDelete
    });
    setSelectedClassIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    setConfirmDeleteClassIds(null);
    onShowToast(`Đã xoá ${idsToDelete.length} lớp học!`);
  };

  // =========================================================
  // STATE 3: QUẢN LÝ GIÁO VIÊN (EXCEL & XOÁ HÀNG LOẠT)
  // =========================================================
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherCodeInput, setTeacherCodeInput] = useState<string>('');
  const [teacherNameInput, setTeacherNameInput] = useState<string>('');
  const [teacherEmailInput, setTeacherEmailInput] = useState<string>('');
  const [teacherPhoneInput, setTeacherPhoneInput] = useState<string>('');
  const [teacherPositionInput, setTeacherPositionInput] = useState<string>('Giáo viên GDTC');
  const [teacherSpecialtyInput, setTeacherSpecialtyInput] = useState<string>('Bóng rổ, Bóng chuyền');
  const [teacherClassesInput, setTeacherClassesInput] = useState<string>('');
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [teacherExcelPaste, setTeacherExcelPaste] = useState<string>('');
  const [showTeacherImportBox, setShowTeacherImportBox] = useState<boolean>(false);
  const [confirmDeleteTeacherIds, setConfirmDeleteTeacherIds] = useState<string[] | null>(null);

  const handleSaveTeacherForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeachers) {
      onShowToast('Tài khoản của bạn chưa được cấp quyền cập nhật danh sách giáo viên!');
      return;
    }
    const cleanName = teacherNameInput.trim();
    if (!cleanName) return;

    if (editingTeacherId) {
      const updated = teachers.map(t =>
        t.id === editingTeacherId
          ? {
              ...t,
              code: teacherCodeInput.trim() || t.code,
              name: cleanName,
              email: teacherEmailInput.trim(),
              phone: teacherPhoneInput.trim(),
              position: teacherPositionInput.trim(),
              specialty: teacherSpecialtyInput.trim(),
              assignedClasses: teacherClassesInput.trim(),
              updatedAt: new Date().toISOString()
            }
          : t
      );
      onUpdateTeachers(updated, {
        actionType: 'UPDATE',
        summary: `Cập nhật thông tin giáo viên ${cleanName}`,
        details: `GV: ${cleanName} (${teacherEmailInput || 'Chưa có email'}) - Chức vụ: ${teacherPositionInput} - Lớp dạy: ${teacherClassesInput}`
      });
      setEditingTeacherId(null);
      onShowToast(`Đã cập nhật giáo viên ${cleanName}!`);
    } else {
      const id = sanitizeFirestoreId(`gv-${cleanName}-${Date.now().toString().slice(-3)}`, 'gv');
      const newTeacher: TeacherProfile = {
        id,
        code: teacherCodeInput.trim() || `GV-GDTC-${teachers.length + 1}`,
        name: cleanName,
        email: teacherEmailInput.trim(),
        phone: teacherPhoneInput.trim(),
        position: teacherPositionInput.trim() || 'Giáo viên GDTC',
        specialty: teacherSpecialtyInput.trim(),
        assignedClasses: teacherClassesInput.trim(),
        updatedAt: new Date().toISOString()
      };
      onUpdateTeachers([...teachers, newTeacher], {
        actionType: 'CREATE',
        summary: `Thêm mới giáo viên ${cleanName}`,
        details: `GV: ${cleanName} (${newTeacher.email}) - Chuyên môn: ${newTeacher.specialty}`
      });
      onShowToast(`Đã thêm giáo viên ${cleanName}!`);
    }

    setTeacherCodeInput('');
    setTeacherNameInput('');
    setTeacherEmailInput('');
    setTeacherPhoneInput('');
    setTeacherClassesInput('');
  };

  const parseTeachersFromRows = (rows: any[][]): TeacherProfile[] => {
    const result: TeacherProfile[] = [];
    rows.forEach((r, idx) => {
      const cols = r.map(x => String(x ?? '').trim());
      if (cols.every(x => !x)) return;
      const first = cols[0].toLowerCase();
      const second = (cols[1] || '').toLowerCase();
      if (first.includes('mã gv') || first === 'stt' || second.includes('họ và tên') || first.includes('họ và tên')) return;

      const hasCodeCol = cols.length >= 3 && (cols[0].toUpperCase().startsWith('GV') || cols[0].length <= 12);
      const code = hasCodeCol ? cols[0] : `GV-GDTC-${idx + 1}`;
      const name = hasCodeCol ? cols[1] : cols[0];
      if (!name) return;

      result.push({
        id: sanitizeFirestoreId(`gv-${name}-${idx}`, 'gv'),
        code: code.slice(0, 50),
        name: name.slice(0, 100),
        email: (hasCodeCol ? cols[2] : cols[1] || '').slice(0, 120),
        phone: (hasCodeCol ? cols[3] : cols[2] || '').slice(0, 30),
        position: (hasCodeCol ? cols[4] : cols[3] || 'Giáo viên GDTC').slice(0, 80),
        specialty: (hasCodeCol ? cols[5] : cols[4] || 'Giáo dục Thể chất').slice(0, 120),
        assignedClasses: (hasCodeCol ? cols[6] : cols[5] || '').slice(0, 200),
        updatedAt: new Date().toISOString()
      });
    });
    return result;
  };

  const handleImportTeachersExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        const imported = parseTeachersFromRows(rows);
        if (imported.length === 0) {
          onShowToast('Không tìm thấy dữ liệu giáo viên hợp lệ trong tệp Excel!');
          return;
        }
        const mergedMap = new Map<string, TeacherProfile>();
        teachers.forEach(t => mergedMap.set(t.name.toLowerCase(), t));
        imported.forEach(t => mergedMap.set(t.name.toLowerCase(), t));
        const merged = Array.from(mergedMap.values());
        onUpdateTeachers(merged, {
          actionType: 'IMPORT_EXCEL',
          summary: `Nhập ${imported.length} giáo viên từ tệp Excel (${file.name})`,
          details: `Danh sách GV nhập: ${imported.map(t => t.name).join(', ')}`
        });
        setShowTeacherImportBox(false);
        onShowToast(`Đã nhập thành công ${imported.length} giáo viên từ Excel!`);
      } catch {
        onShowToast('Lỗi đọc tệp Excel danh sách giáo viên!');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportTeachersFromPaste = () => {
    if (!teacherExcelPaste.trim()) return;
    const rows = teacherExcelPaste
      .trim()
      .split(/\r?\n/)
      .map(line => (line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',')));
    const imported = parseTeachersFromRows(rows);
    if (imported.length === 0) {
      onShowToast('Không nhận diện được dữ liệu giáo viên hợp lệ!');
      return;
    }
    const mergedMap = new Map<string, TeacherProfile>();
    teachers.forEach(t => mergedMap.set(t.name.toLowerCase(), t));
    imported.forEach(t => mergedMap.set(t.name.toLowerCase(), t));
    const merged = Array.from(mergedMap.values());
    onUpdateTeachers(merged, {
      actionType: 'IMPORT_EXCEL',
      summary: `Nhập ${imported.length} giáo viên bằng sao chép Excel`,
      details: `Danh sách GV nhập: ${imported.map(t => t.name).join(', ')}`
    });
    setTeacherExcelPaste('');
    setShowTeacherImportBox(false);
    onShowToast(`Đã nhập thành công ${imported.length} giáo viên!`);
  };

  const handleDownloadTeacherExcelTemplate = () => {
    const rows = [
      ['Mã GV', 'Họ và tên', 'Email Google', 'Số điện thoại', 'Chức vụ', 'Chuyên môn chính', 'Các lớp phụ trách'],
      ['GV-GDTC-01', 'Bồ Công Lâm', 'boconglam@gmail.com', '0984511901', 'Quản trị hệ thống / GV GDTC', 'Bóng rổ, Bóng chuyền', '10A1, 12C1'],
      ['GV-GDTC-02', 'Nguyễn Tấn Phước', 'tdtt.htp@gmail.com', '0918234567', 'Tổ trưởng / GV GDTC', 'Bóng chuyền, Điền kinh', '10A2, 11B2'],
      ['GV-GDTC-03', 'Nguyễn Trung Hiếu', 'trunghieu.htp@gmail.com', '0919345678', 'Giáo viên GDTC', 'Bóng rổ, Cầu lông', '10A3, 12C1']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Giao_Vien');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Giao_Vien_THPT_HuynhTanPhat.xlsx');
  };

  const executeBulkDeleteTeachers = (idsToDelete: string[]) => {
    if (!canManageTeachers) {
      onShowToast('Tài khoản của bạn chưa được cấp quyền xoá giáo viên!');
      return;
    }
    const deletedNames = teachers.filter(t => idsToDelete.includes(t.id)).map(t => t.name).join(', ');
    const remaining = teachers.filter(t => !idsToDelete.includes(t.id));
    onUpdateTeachers(remaining, {
      actionType: idsToDelete.length > 1 ? 'BULK_DELETE' : 'DELETE',
      summary: `Xoá ${idsToDelete.length > 1 ? 'hàng loạt ' : ''}${idsToDelete.length} giáo viên (${deletedNames})`,
      details: `Đã xoá giáo viên: ${deletedNames}. Còn lại: ${remaining.length} giáo viên.`,
      deletedIds: idsToDelete
    });
    setSelectedTeacherIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    setConfirmDeleteTeacherIds(null);
    onShowToast(`Đã xoá ${idsToDelete.length} giáo viên!`);
  };

  // =========================================================
  // STATE 4: QUẢN TRỊ PHÂN QUYỀN & DUYỆT TÀI KHOẢN GOOGLE
  // =========================================================
  const [preApproveEmail, setPreApproveEmail] = useState<string>('');
  const [preApproveName, setPreApproveName] = useState<string>('');
  const [preApproveRole, setPreApproveRole] = useState<UserAccountRole>('gv');

  const pendingAccounts = useMemo(
    () => allUserAccounts.filter(u => u.status === 'pending'),
    [allUserAccounts]
  );

  const handlePreApproveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      onShowToast('Chỉ Admin (boconglam@gmail.com hoặc tdtt.htp@gmail.com) mới có quyền phân quyền hệ thống!');
      return;
    }
    const cleanEmail = preApproveEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) return;

    const uid = sanitizeFirestoreId(`pre-${cleanEmail}`, 'u');
    const newAcc: UserAccount = {
      uid,
      email: cleanEmail,
      displayName: preApproveName.trim() || cleanEmail.split('@')[0],
      photoURL: '',
      role: preApproveRole,
      status: 'approved',
      canManageStudents: true,
      canManageClasses: preApproveRole === 'admin' || preApproveRole === 'gv',
      canManageTeachers: preApproveRole === 'admin',
      canManageUsers: preApproveRole === 'admin',
      approvedBy: currentUserAccount?.email || 'Admin',
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await onAdminUpdateUser(
      newAcc,
      `Cấp quyền trước cho tài khoản Google ${cleanEmail} (Vai trò: ${preApproveRole.toUpperCase()})`
    );
    setPreApproveEmail('');
    setPreApproveName('');
  };

  // =========================================================
  // STATE 5: NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG (AUDIT LOGS)
  // =========================================================
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState<string>('');

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (auditActionFilter !== 'all' && log.actionType !== auditActionFilter) return false;
      if (auditEntityFilter !== 'all' && log.targetEntity !== auditEntityFilter) return false;
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase().trim();
        return (
          log.summary.toLowerCase().includes(q) ||
          (log.details || '').toLowerCase().includes(q) ||
          log.actorEmail.toLowerCase().includes(q) ||
          (log.actorName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, auditActionFilter, auditEntityFilter, auditSearch]);

  const handleExportAuditLogsExcel = () => {
    const rows = [
      ['Thời gian', 'Người thực hiện', 'Email Google', 'Loại tác vụ', 'Đối tượng', 'Tóm tắt nội dung', 'Chi tiết thay đổi'],
      ...filteredAuditLogs.map(l => [
        new Date(l.timestamp).toLocaleString('vi-VN'),
        l.actorName || '',
        l.actorEmail,
        l.actionType,
        l.targetEntity,
        l.summary,
        l.details || ''
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhat_Ky_Hoat_Dong');
    XLSX.writeFile(wb, `Nhat_Ky_He_Thong_THPT_HuynhTanPhat_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Tạo đường dẫn gửi thông báo Email trực tiếp đến 2 tài khoản Admin
  const buildAdminApprovalMailtoUrl = (acc: UserAccount) => {
    const subject = encodeURIComponent(`[EduSport AI - THPT Huỳnh Tấn Phát] Yêu cầu xét duyệt quyền truy cập: ${acc.email}`);
    const body = encodeURIComponent(
      `Kính gửi Quản trị viên Hệ thống GDTC (${SUPER_ADMIN_EMAILS.join(' / ')}),\n\n` +
      `Tôi vừa đăng nhập vào Hệ thống EduSport AI - THPT Huỳnh Tấn Phát bằng tài khoản Google:\n` +
      `- Họ và tên: ${acc.displayName || acc.email}\n` +
      `- Email Google: ${acc.email}\n` +
      `- Thời gian yêu cầu: ${new Date().toLocaleString('vi-VN')}\n\n` +
      `Kính đề nghị Admin phê duyệt và phân quyền sử dụng hệ thống cho tài khoản của tôi.\n` +
      `Trân trọng cảm ơn!`
    );
    return `mailto:${SUPER_ADMIN_EMAILS.join(',')}?subject=${subject}&body=${body}`;
  };

  const handleGateLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setGateError('');
    if (!onAuthorize) {
      onOpenAuthModal();
      return;
    }
    const ok = onAuthorize(gateUsername.trim(), gatePassword.trim());
    if (!ok) {
      setGateError('Tên tài khoản hoặc mã cấp quyền không chính xác! Vui lòng đăng nhập bằng tài khoản Google được phân quyền hoặc liên hệ Admin (boconglam@gmail.com / tdtt.htp@gmail.com).');
    } else {
      setGatePassword('');
    }
  };

  // CHẶN TRUY CẬP NẾU CHƯA ĐĂNG NHẬP ĐÚNG VAI TRÒ PHÂN QUYỀN
  if (!hasSystemAdminPortalAccess) {
    const isPendingGoogle = currentUserAccount?.status === 'pending';
    const isRejectedGoogle = currentUserAccount?.status === 'rejected';
    const isStudentRole = userRole === 'hs' || currentUserAccount?.role === 'hs';

    return (
      <div id="tab-quantri" className="tab-content block space-y-4">
        <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-950 text-white p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/50 text-amber-300 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                  <i className="fa-solid fa-user-lock"></i>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded uppercase">
                      YÊU CẦU XÁC THỰC VAI TRÒ & PHÂN QUYỀN
                    </span>
                    <span className="text-xs text-emerald-300 font-semibold">
                      THPT Huỳnh Tấn Phát • Hệ Thống Quản Trị Dữ Liệu
                    </span>
                  </div>
                  <h2 className="text-lg md:text-xl font-bold text-white">
                    Chức Năng Quản Trị Hệ Thống Chỉ Dành Cho Tài Khoản Đã Đăng Nhập Đúng Vai Trò Phân Quyền
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Để bảo vệ an toàn dữ liệu Học sinh, Lớp học, Giáo viên, Phân quyền hệ thống và Nhật ký hoạt động, vui lòng đăng nhập và xác thực đúng vai trò <strong>Quản trị viên (Admin)</strong> hoặc <strong>Giáo viên đã được Admin xét duyệt phân quyền</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Cảnh báo trạng thái hiện tại */}
            {isStudentRole && (
              <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex items-start gap-3 text-xs text-rose-900">
                <i className="fa-solid fa-ban text-rose-600 text-lg mt-0.5"></i>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-rose-950">
                    Từ chối truy cập: Bạn đang ở vai trò &quot;Học sinh&quot;
                  </p>
                  <p>
                    Vai trò Học sinh không có quyền truy cập vào Trung tâm Quản trị Hệ thống. Nếu là Giáo viên hoặc Quản trị viên, vui lòng chuyển vai trò sang <strong>Giáo viên</strong> và đăng nhập bằng tài khoản được cấp quyền.
                  </p>
                </div>
              </div>
            )}

            {isPendingGoogle && currentUserAccount && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-amber-950">
                <div className="flex items-start gap-3">
                  <i className="fa-solid fa-hourglass-half text-amber-600 text-lg mt-0.5 animate-pulse"></i>
                  <div className="space-y-1">
                    <p className="font-bold text-sm">
                      Tài khoản Google ({currentUserAccount.email}) đang chờ Admin xét duyệt phân quyền!
                    </p>
                    <p className="text-amber-800">
                      Hệ thống đã gửi thông báo yêu cầu xét duyệt tới 2 tài khoản Quản trị tối cao: <strong>boconglam@gmail.com</strong> và <strong>tdtt.htp@gmail.com</strong>. Bạn chỉ có thể sử dụng chức năng Quản trị hệ thống sau khi được Admin bấm <strong>Phê duyệt</strong>.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={buildAdminApprovalMailtoUrl(currentUserAccount)}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs"
                  >
                    <i className="fa-solid fa-envelope"></i>
                    <span>Gửi Email Nhắc Admin Duyệt</span>
                  </a>
                  <button
                    type="button"
                    onClick={onGoogleLogout}
                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-300 cursor-pointer"
                  >
                    Đổi tài khoản
                  </button>
                </div>
              </div>
            )}

            {isRejectedGoogle && currentUserAccount && (
              <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-rose-950">
                <div className="flex items-start gap-3">
                  <i className="fa-solid fa-circle-xmark text-rose-600 text-lg mt-0.5"></i>
                  <div className="space-y-1">
                    <p className="font-bold text-sm">
                      Tài khoản Google ({currentUserAccount.email}) đã bị từ chối hoặc thu hồi quyền truy cập!
                    </p>
                    <p className="text-rose-800">
                      Vui lòng liên hệ Quản trị viên hệ thống (<strong>boconglam@gmail.com</strong> hoặc <strong>tdtt.htp@gmail.com</strong>) để được cấp lại quyền.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onGoogleLogout}
                  className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer"
                >
                  Đăng xuất Google
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CỘT 1: ĐĂNG NHẬP BẰNG TÀI KHOẢN GOOGLE PHÂN QUYỀN */}
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white p-5 rounded-2xl border border-blue-200 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-1 rounded-md bg-blue-700 text-white">
                    <i className="fa-brands fa-google"></i> Phương thức 1: Xác thực Google OAuth
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Đăng Nhập Bằng Tài Khoản Google Quản Trị / Giáo Viên
                  </h3>
                  <div className="space-y-2 text-xs text-slate-700 bg-white p-3.5 rounded-xl border border-blue-100">
                    <p className="flex items-start gap-2">
                      <i className="fa-solid fa-crown text-amber-500 mt-0.5"></i>
                      <span>
                        <strong>Quản trị viên hệ thống (Super Admin):</strong> Đăng nhập bằng{' '}
                        <code className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">boconglam@gmail.com</code> hoặc{' '}
                        <code className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">tdtt.htp@gmail.com</code>{' '}
                        để mở khóa <strong>toàn quyền xử lý dữ liệu và phân quyền hệ thống</strong>.
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <i className="fa-solid fa-user-check text-emerald-600 mt-0.5"></i>
                      <span>
                        <strong>Tài khoản Giáo viên / Cán bộ:</strong> Đăng nhập bằng Google để kiểm tra quyền. Nếu tài khoản chưa được duyệt, hệ thống sẽ gửi yêu cầu xét duyệt tới 2 tài khoản Admin trên.
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onGoogleLogin}
                  className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2.5 text-sm"
                >
                  <i className="fa-brands fa-google text-amber-300 text-base"></i>
                  <span>Đăng Nhập & Xác Thực Bằng Tài Khoản Google</span>
                </button>
              </div>

              {/* CỘT 2: ĐĂNG NHẬP BẰNG TÀI KHOẢN & MÃ CẤP QUYỀN GIÁO VIÊN */}
              <form onSubmit={handleGateLogin} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-1 rounded-md bg-emerald-800 text-white">
                    <i className="fa-solid fa-key"></i> Phương thức 2: Tài khoản Giáo viên & Mã bảo mật
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Xác Thực Nhanh Quyền Giáo Viên Tổ Bộ Môn GDTC
                  </h3>

                  {gateError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                      <i className="fa-solid fa-circle-exclamation mr-1.5 text-rose-600"></i>
                      {gateError}
                    </div>
                  )}

                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Tên Giáo viên / Tài khoản được phân quyền:
                      </label>
                      <input
                        type="text"
                        value={gateUsername}
                        onChange={(e) => setGateUsername(e.target.value)}
                        placeholder="VD: Bồ Công Lâm, Nguyễn Tấn Phước..."
                        required
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Mã cấp quyền quản trị / chuyên môn:
                      </label>
                      <input
                        type="password"
                        value={gatePassword}
                        onChange={(e) => setGatePassword(e.target.value)}
                        placeholder="Nhập mã cấp quyền..."
                        required
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 font-bold text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <i className="fa-solid fa-unlock-keyhole"></i>
                  <span>Xác Thực Quyền & Mở Quản Trị Hệ Thống</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="tab-quantri" className="tab-content block space-y-4">
      
      {/* BANNER TRẠNG THÁI XÁC THỰC GOOGLE & QUYỀN QUẢN TRỊ ADMIN */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-emerald-500/40 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-inner border ${
              isSuperAdmin
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : currentUserAccount?.status === 'approved'
                ? 'bg-emerald-600 text-white border-emerald-400'
                : currentUserAccount?.status === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              <i className={`fa-solid ${
                isSuperAdmin ? 'fa-crown' : currentUserAccount?.status === 'approved' ? 'fa-user-check' : 'fa-user-shield'
              }`}></i>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wide">
                  QUẢN TRỊ HỆ THỐNG & DỮ LIỆU
                </span>
                <span className="text-xs text-emerald-300 font-semibold">
                  Admin Hệ Thống: boconglam@gmail.com • tdtt.htp@gmail.com
                </span>
              </div>

              <h2 className="text-base sm:text-lg font-bold text-white">
                Trung Tâm Quản Lý Học Sinh, Lớp Học, Giáo Viên, Phân Quyền & Nhật Ký Hệ Thống
              </h2>

              {currentUserAccount ? (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-300">
                    Đang đăng nhập Google: <strong className="text-white">{currentUserAccount.displayName}</strong> ({currentUserAccount.email})
                  </span>
                  {isSuperAdmin ? (
                    <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold text-[11px]">
                      ★ Super Admin (Toàn quyền hệ thống)
                    </span>
                  ) : currentUserAccount.status === 'approved' ? (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold text-[11px]">
                      ✓ Đã được Admin phê duyệt ({currentUserAccount.role.toUpperCase()})
                    </span>
                  ) : currentUserAccount.status === 'pending' ? (
                    <span className="bg-amber-500/30 text-amber-200 border border-amber-400/50 px-2 py-0.5 rounded-full font-bold text-[11px] animate-pulse">
                      ⏳ Đang chờ Admin (boconglam@gmail.com / tdtt.htp@gmail.com) xét duyệt
                    </span>
                  ) : (
                    <span className="bg-rose-500/30 text-rose-200 border border-rose-400/50 px-2 py-0.5 rounded-full font-bold text-[11px]">
                      ✕ Tài khoản bị từ chối quyền
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-300">
                  Đăng nhập bằng tài khoản Google (<strong>boconglam@gmail.com</strong> hoặc <strong>tdtt.htp@gmail.com</strong> để có toàn quyền Admin; các tài khoản Google khác sẽ gửi thông báo xét duyệt tới Admin).
                </p>
              )}
            </div>
          </div>

          {/* Cụm nút Đăng nhập Google / Quản lý */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {!currentUserAccount ? (
              <button
                type="button"
                onClick={onGoogleLogin}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg transition cursor-pointer"
              >
                <i className="fa-brands fa-google text-rose-600 text-base"></i>
                <span>Đăng Nhập Bằng Google</span>
              </button>
            ) : (
              <>
                {currentUserAccount.status === 'pending' && (
                  <a
                    href={buildAdminApprovalMailtoUrl(currentUserAccount)}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition"
                  >
                    <i className="fa-solid fa-paper-plane"></i>
                    <span>Gửi Email Thông Báo Admin Duyệt</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={onGoogleLogout}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-rose-700 text-slate-200 hover:text-white font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  <span>Đăng xuất Google</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onOpenAuthModal}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-emerald-600 transition cursor-pointer"
            >
              <i className="fa-solid fa-key text-amber-300"></i>
              <span>Mã bảo mật trường</span>
            </button>
          </div>
        </div>

        {/* CẢNH BÁO NẾU TÀI KHOẢN GOOGLE ĐANG CHỜ ADMIN XÉT DUYỆT */}
        {currentUserAccount && currentUserAccount.status === 'pending' && (
          <div className="mt-4 bg-amber-950/90 border border-amber-400/60 rounded-xl p-3.5 text-xs text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <i className="fa-solid fa-bell text-amber-400 text-base mt-0.5 animate-bounce"></i>
              <div>
                <p className="font-bold text-amber-300">
                  Hệ thống đã gửi thông báo yêu cầu xét duyệt đến Admin (boconglam@gmail.com và tdtt.htp@gmail.com)!
                </p>
                <p className="text-amber-200/90 mt-0.5">
                  Tài khoản <strong>{currentUserAccount.email}</strong> đang ở trạng thái <strong>Chờ xét duyệt</strong>. Sau khi Admin đăng nhập và bấm <em>Phê duyệt</em>, tài khoản của Thầy/Cô sẽ tự động được kích hoạt quyền chỉnh sửa dữ liệu.
                </p>
              </div>
            </div>
            <a
              href={buildAdminApprovalMailtoUrl(currentUserAccount)}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs shrink-0 text-center"
            >
              Gửi nhắc báo qua Gmail
            </a>
          </div>
        )}

        {/* THÔNG BÁO NỔI BẬT CHO ADMIN KHI CÓ TÀI KHOẢN ĐANG CHỜ XÉT DUYỆT */}
        {isSuperAdmin && pendingAccounts.length > 0 && (
          <div className="mt-4 bg-rose-950/90 border-2 border-rose-400 rounded-xl p-3.5 text-xs text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center font-black text-sm animate-pulse">
                {pendingAccounts.length}
              </span>
              <div>
                <p className="font-bold text-amber-300">
                  Thông báo Quản trị viên: Có {pendingAccounts.length} tài khoản Google mới đang chờ Thầy/Cô xét duyệt cấp quyền!
                </p>
                <p className="text-rose-200">
                  Danh sách chờ: {pendingAccounts.map(a => `${a.displayName} (${a.email})`).join(', ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('rbac')}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs shrink-0 cursor-pointer"
            >
              Mở Bảng Xét Duyệt Ngay →
            </button>
          </div>
        )}
      </div>

      {/* THANH CHUYỂN ĐỔI 5 PHÂN HỆ QUẢN TRỊ */}
      <div className="bg-white rounded-xl p-2 border border-slate-200 shadow-xs flex flex-wrap gap-1.5 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveSubTab('students')}
          className={`px-3.5 py-2.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'students'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-users"></i>
          <span>1. Danh Sách Học Sinh ({students.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('classes')}
          className={`px-3.5 py-2.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'classes'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-school"></i>
          <span>2. Danh Sách Lớp Học ({classes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('teachers')}
          className={`px-3.5 py-2.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'teachers'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-chalkboard-user"></i>
          <span>3. Danh Sách Giáo Viên ({teachers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('rbac')}
          className={`px-3.5 py-2.5 rounded-lg flex items-center gap-2 transition cursor-pointer relative ${
            activeSubTab === 'rbac'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-user-lock"></i>
          <span>4. Phân Quyền & Duyệt Tài Khoản Google</span>
          {pendingAccounts.length > 0 && (
            <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
              {pendingAccounts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audit')}
          className={`px-3.5 py-2.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'audit'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <i className="fa-solid fa-clock-rotate-left"></i>
          <span>5. Nhật Ký Hoạt Động Hệ Thống ({auditLogs.length})</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* SUB-TAB 1: QUẢN LÝ DANH SÁCH HỌC SINH (EXCEL & XOÁ HÀNG LOẠT) */}
      {/* ========================================================= */}
      {activeSubTab === 'students' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          {!canManageStudents && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <i className="fa-solid fa-lock text-amber-600"></i>
              <span>
                Tài khoản của bạn hiện ở chế độ Chỉ xem đối với Danh sách Học sinh. Liên hệ Admin (boconglam@gmail.com / tdtt.htp@gmail.com) để được phân quyền cập nhật/xoá học sinh.
              </span>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <i className="fa-solid fa-users text-emerald-700"></i>
                <span>Quản Lý Danh Sách Học Sinh (Nhập Từ Excel & Xoá Hàng Loạt)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Chọn nhiều học sinh để xoá hàng loạt hoặc nhập danh sách học sinh mới từ tệp Excel (.xlsx, .xls, .csv)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canManageStudents && (
                <button
                  type="button"
                  onClick={() => setIsImportStudentsOpen(true)}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <i className="fa-solid fa-file-excel"></i>
                  <span>Nhập Học Sinh Từ Excel (.xlsx/.csv)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportStudentsExcel}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 cursor-pointer"
              >
                <i className="fa-solid fa-file-export text-emerald-700"></i>
                <span>Xuất File Excel (.xlsx)</span>
              </button>

              {canManageStudents && selectedStudentIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStudentIds(selectedStudentIds)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>Xoá Hàng Loạt Đã Chọn ({selectedStudentIds.length} HS)</span>
                </button>
              )}

              {canManageStudents && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStudents(INITIAL_STUDENTS, {
                      actionType: 'IMPORT_EXCEL',
                      summary: 'Khôi phục danh sách 70 học sinh mặc định của trường',
                      details: 'Đã nạp lại danh sách mẫu chuẩn của 5 lớp 10A1, 10A3, 12C1, 12C2, 12C3.'
                    })
                  }
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Khôi phục DS gốc
                </button>
              )}
            </div>
          </div>

          {/* Hộp xác nhận xoá hàng loạt học sinh */}
          {canManageStudents && confirmDeleteStudentIds && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-rose-900">
                <i className="fa-solid fa-triangle-exclamation text-rose-600 text-lg"></i>
                <div>
                  <p className="font-bold text-sm">
                    Xác nhận xoá {confirmDeleteStudentIds.length} học sinh đã chọn?
                  </p>
                  <p className="text-rose-700">
                    Thao tác này sẽ xoá học sinh khỏi cơ sở dữ liệu đám mây Firestore và ghi vào Nhật ký hoạt động hệ thống.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStudentIds(null)}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => executeBulkDeleteStudents(confirmDeleteStudentIds)}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Xác nhận xoá ngay
                </button>
              </div>
            </div>
          )}

          {/* Bộ lọc lớp & tìm kiếm học sinh */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-700">Lọc theo lớp:</span>
              <button
                type="button"
                onClick={() => setStudentClassFilter('all')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                  studentClassFilter === 'all'
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                Tất cả ({students.length})
              </button>
              {Array.from(new Set([...classes.map(c => c.name), ...students.map(s => s.class)])).sort().map(clsName => {
                const count = students.filter(s => s.class === clsName).length;
                return (
                  <button
                    key={clsName}
                    type="button"
                    onClick={() => setStudentClassFilter(clsName)}
                    className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                      studentClassFilter === clsName
                        ? 'bg-emerald-800 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {clsName} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Tìm mã HS, họ tên, lớp..."
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-52"
              />
              {canManageStudents && filteredStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStudentIds(filteredStudents.map(s => s.id))}
                  className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-lg border border-rose-300 cursor-pointer"
                  title="Xoá toàn bộ học sinh đang hiển thị trong bộ lọc hiện tại"
                >
                  Xoá tất cả đang lọc ({filteredStudents.length})
                </button>
              )}
            </div>
          </div>

          {/* Bảng danh sách học sinh có tích chọn hàng loạt */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManageStudents}
                      checked={
                        filteredStudents.length > 0 &&
                        filteredStudents.every(s => selectedStudentIds.includes(s.id))
                      }
                      onChange={handleToggleSelectAllStudents}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Mã HS</th>
                  <th className="p-3">Họ và Tên</th>
                  <th className="p-3">Lớp</th>
                  <th className="p-3">Giới tính</th>
                  <th className="p-3">Cao / Nặng / BMI</th>
                  <th className="p-3">Ghi chú sức khỏe</th>
                  <th className="p-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      Chưa có học sinh nào trong danh sách lọc.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const isChecked = selectedStudentIds.includes(st.id);
                    return (
                      <tr key={st.id} className={`hover:bg-slate-50 ${isChecked ? 'bg-rose-50/50' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            disabled={!canManageStudents}
                            checked={isChecked}
                            onChange={() => handleToggleSelectStudent(st.id)}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-600">{st.code}</td>
                        <td className="p-3 font-bold text-slate-900">{st.name}</td>
                        <td className="p-3 font-bold text-emerald-800">{st.class}</td>
                        <td className="p-3">{st.gender}</td>
                        <td className="p-3">
                          {st.heightCm}cm / {st.weightKg}kg • <strong>BMI {st.bmi}</strong>
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate">{st.medicalNote}</td>
                        <td className="p-3 text-center">
                          {canManageStudents ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingStudent(st)}
                                className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 rounded font-semibold cursor-pointer"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStudentIds([st.id])}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-semibold cursor-pointer"
                              >
                                Xoá
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Chỉ xem</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: QUẢN LÝ DANH SÁCH LỚP HỌC (EXCEL & XOÁ HÀNG LOẠT) */}
      {/* ========================================================= */}
      {activeSubTab === 'classes' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          {!canManageClasses && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <i className="fa-solid fa-lock text-amber-600"></i>
              <span>
                Tài khoản của bạn hiện ở chế độ Chỉ xem đối với Danh sách Lớp học. Liên hệ Admin (boconglam@gmail.com / tdtt.htp@gmail.com) để được phân quyền cập nhật/xoá lớp học.
              </span>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <i className="fa-solid fa-school text-emerald-700"></i>
                <span>Quản Lý Danh Sách Lớp Học (Nhập Từ Excel & Xoá Hàng Loạt)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Quản lý danh mục các lớp khối 10, 11, 12 của trường THPT Huỳnh Tấn Phát
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canManageClasses && (
                <button
                  type="button"
                  onClick={() => setShowClassImportBox(prev => !prev)}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <i className="fa-solid fa-file-excel"></i>
                  <span>Nhập Lớp Học Từ Excel (.xlsx/.csv)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadClassExcelTemplate}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 cursor-pointer"
              >
                <i className="fa-solid fa-download text-emerald-700"></i>
                <span>Tải File Mẫu Lớp (.xlsx)</span>
              </button>

              {canManageClasses && selectedClassIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteClassIds(selectedClassIds)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>Xoá Hàng Loạt Lớp Đã Chọn ({selectedClassIds.length})</span>
                </button>
              )}

              {canManageClasses && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateClasses(INITIAL_CLASSES, {
                      actionType: 'IMPORT_EXCEL',
                      summary: 'Khôi phục danh sách lớp học mặc định của trường'
                    })
                  }
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Khôi phục Lớp gốc
                </button>
              )}
            </div>
          </div>

          {/* Hộp nhập lớp học từ Excel */}
          {canManageClasses && showClassImportBox && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-file-excel text-emerald-700"></i>
                  <span>Nhập Danh Sách Lớp Học Hàng Loạt Từ Excel (.xlsx / .csv)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowClassImportBox(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-slate-600">
                Cấu trúc 6 cột Excel: <strong>Tên lớp | Khối (10/11/12) | Giáo viên chủ nhiệm | GV GDTC phụ trách | Năm học | Ghi chú</strong>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-3.5 rounded-xl border border-emerald-300 space-y-2">
                  <label className="font-bold text-slate-800 block">Cách 1: Chọn tệp Excel (.xlsx, .xls, .csv) từ máy:</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportClassesExcelFile}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white cursor-pointer"
                  />
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <label className="font-bold text-slate-800 block">Cách 2: Sao chép & Dán các dòng từ Excel:</label>
                  <textarea
                    rows={2}
                    value={classExcelPaste}
                    onChange={(e) => setClassExcelPaste(e.target.value)}
                    placeholder="VD: 10A4	10	Lê Văn Tám	Bồ Công Lâm	2025 - 2026	Bóng rổ"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleImportClassesFromPaste}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Nhập dữ liệu lớp đã dán
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hộp xác nhận xoá hàng loạt lớp học */}
          {canManageClasses && confirmDeleteClassIds && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex items-center justify-between gap-3 text-xs">
              <div className="text-rose-900">
                <p className="font-bold text-sm">Xác nhận xoá {confirmDeleteClassIds.length} lớp học đã chọn?</p>
                <p>Hành động này sẽ xoá các lớp đã chọn khỏi danh mục lớp và ghi nhận vào nhật ký hệ thống.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteClassIds(null)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => executeBulkDeleteClasses(confirmDeleteClassIds)}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-lg font-bold cursor-pointer"
                >
                  Xoá ngay
                </button>
              </div>
            </div>
          )}

          {/* Form Thêm / Sửa Lớp Học */}
          {canManageClasses && (
            <form onSubmit={handleSaveClassForm} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs items-end">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên lớp *</label>
                <input
                  type="text"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="VD: 10A2, 11B1..."
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Khối lớp</label>
                <select
                  value={classGradeInput}
                  onChange={(e) => setClassGradeInput(e.target.value as GradeLevel)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                >
                  <option value="10">Khối 10</option>
                  <option value="11">Khối 11</option>
                  <option value="12">Khối 12</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">GV Chủ nhiệm</label>
                <input
                  type="text"
                  value={classHomeroomInput}
                  onChange={(e) => setClassHomeroomInput(e.target.value)}
                  placeholder="Họ tên GVCN..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">GV GDTC phụ trách</label>
                <input
                  type="text"
                  value={classPeTeacherInput}
                  onChange={(e) => setClassPeTeacherInput(e.target.value)}
                  placeholder="Tên GV GDTC..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú phân môn</label>
                <input
                  type="text"
                  value={classNoteInput}
                  onChange={(e) => setClassNoteInput(e.target.value)}
                  placeholder="Bóng rổ / Cầu lông..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  className="flex-1 py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  {editingClassId ? 'Lưu Sửa' : '+ Thêm Lớp'}
                </button>
                {editingClassId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingClassId(null);
                      setClassNameInput('');
                    }}
                    className="py-1.5 px-2 bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Bảng danh sách lớp học */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManageClasses}
                      checked={classes.length > 0 && classes.every(c => selectedClassIds.includes(c.id))}
                      onChange={() => {
                        if (classes.every(c => selectedClassIds.includes(c.id))) {
                          setSelectedClassIds([]);
                        } else {
                          setSelectedClassIds(classes.map(c => c.id));
                        }
                      }}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Tên Lớp</th>
                  <th className="p-3">Khối</th>
                  <th className="p-3">Sĩ số hiện tại</th>
                  <th className="p-3">GV Chủ nhiệm</th>
                  <th className="p-3">GV GDTC Phụ trách</th>
                  <th className="p-3">Năm học</th>
                  <th className="p-3">Ghi chú</th>
                  <th className="p-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((cls) => {
                  const stCount = students.filter(s => s.class === cls.name).length;
                  const isChecked = selectedClassIds.includes(cls.id);
                  return (
                    <tr key={cls.id} className={`hover:bg-slate-50 ${isChecked ? 'bg-rose-50/50' : ''}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!canManageClasses}
                          checked={isChecked}
                          onChange={() =>
                            setSelectedClassIds(prev =>
                              prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id]
                            )
                          }
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-black text-emerald-800 text-sm">{cls.name}</td>
                      <td className="p-3 font-bold">Khối {cls.grade}</td>
                      <td className="p-3">
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                          {stCount} học sinh
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-800">{cls.homeroomTeacher || '—'}</td>
                      <td className="p-3 font-semibold text-emerald-900">{cls.peTeacher || '—'}</td>
                      <td className="p-3 text-slate-600">{cls.schoolYear || '2025 - 2026'}</td>
                      <td className="p-3 text-slate-600">{cls.note || '—'}</td>
                      <td className="p-3 text-center">
                        {canManageClasses ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingClassId(cls.id);
                                setClassNameInput(cls.name);
                                setClassGradeInput(cls.grade);
                                setClassHomeroomInput(cls.homeroomTeacher || '');
                                setClassPeTeacherInput(cls.peTeacher || '');
                                setClassSchoolYearInput(cls.schoolYear || '2025 - 2026');
                                setClassNoteInput(cls.note || '');
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 rounded font-semibold cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClassIds([cls.id])}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-semibold cursor-pointer"
                            >
                              Xoá
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 3: QUẢN LÝ DANH SÁCH GIÁO VIÊN (EXCEL & XOÁ HÀNG LOẠT) */}
      {/* ========================================================= */}
      {activeSubTab === 'teachers' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          {!canManageTeachers && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <i className="fa-solid fa-lock text-amber-600"></i>
              <span>
                Tài khoản của bạn hiện ở chế độ Chỉ xem đối với Danh sách Giáo viên. Chỉ Quản trị viên (boconglam@gmail.com / tdtt.htp@gmail.com) hoặc tài khoản được Admin phân quyền &quot;Quản lý Giáo viên&quot; mới được thêm/sửa/xoá giáo viên.
              </span>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <i className="fa-solid fa-chalkboard-user text-emerald-700"></i>
                <span>Quản Lý Danh Sách Giáo Viên (Nhập Từ Excel & Xoá Hàng Loạt)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Cập nhật danh sách Giáo viên Tổ Giáo dục Thể chất trường THPT Huỳnh Tấn Phát
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canManageTeachers && (
                <button
                  type="button"
                  onClick={() => setShowTeacherImportBox(prev => !prev)}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <i className="fa-solid fa-file-excel"></i>
                  <span>Nhập Giáo Viên Từ Excel (.xlsx/.csv)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadTeacherExcelTemplate}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 cursor-pointer"
              >
                <i className="fa-solid fa-download text-emerald-700"></i>
                <span>Tải File Mẫu GV (.xlsx)</span>
              </button>

              {canManageTeachers && selectedTeacherIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTeacherIds(selectedTeacherIds)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>Xoá Hàng Loạt GV Đã Chọn ({selectedTeacherIds.length})</span>
                </button>
              )}

              {canManageTeachers && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTeachers(INITIAL_TEACHERS, {
                      actionType: 'IMPORT_EXCEL',
                      summary: 'Khôi phục danh sách 7 giáo viên GDTC mặc định của trường'
                    })
                  }
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Khôi phục DS GV gốc
                </button>
              )}
            </div>
          </div>

          {/* Hộp nhập giáo viên từ Excel */}
          {canManageTeachers && showTeacherImportBox && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                  <i className="fa-solid fa-file-excel text-emerald-700"></i>
                  <span>Nhập Danh Sách Giáo Viên Từ Tệp Excel (.xlsx / .csv)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTeacherImportBox(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-slate-600">
                Cấu trúc cột: <strong>Mã GV | Họ và tên | Email Google | Số điện thoại | Chức vụ | Chuyên môn | Các lớp phụ trách</strong>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-3.5 rounded-xl border border-emerald-300 space-y-2">
                  <label className="font-bold text-slate-800 block">Cách 1: Chọn tệp Excel (.xlsx, .xls, .csv) từ máy:</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportTeachersExcelFile}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white cursor-pointer"
                  />
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <label className="font-bold text-slate-800 block">Cách 2: Sao chép & Dán các dòng từ Excel:</label>
                  <textarea
                    rows={2}
                    value={teacherExcelPaste}
                    onChange={(e) => setTeacherExcelPaste(e.target.value)}
                    placeholder="VD: GV-08	Lê Minh Tuấn	minhtuan@gmail.com	0912345678	Giáo viên GDTC	Bóng rổ	10A1, 10A2"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleImportTeachersFromPaste}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Nhập dữ liệu GV đã dán
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hộp xác nhận xoá hàng loạt giáo viên */}
          {canManageTeachers && confirmDeleteTeacherIds && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex items-center justify-between gap-3 text-xs">
              <div className="text-rose-900">
                <p className="font-bold text-sm">Xác nhận xoá {confirmDeleteTeacherIds.length} giáo viên đã chọn?</p>
                <p>Hành động này sẽ xoá giáo viên khỏi danh mục và lưu vào Nhật ký hoạt động hệ thống.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTeacherIds(null)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => executeBulkDeleteTeachers(confirmDeleteTeacherIds)}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-lg font-bold cursor-pointer"
                >
                  Xoá ngay
                </button>
              </div>
            </div>
          )}

          {/* Form Thêm / Sửa Giáo Viên */}
          {canManageTeachers && (
            <form onSubmit={handleSaveTeacherForm} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-7 gap-2.5 text-xs items-end">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã GV</label>
                <input
                  type="text"
                  value={teacherCodeInput}
                  onChange={(e) => setTeacherCodeInput(e.target.value)}
                  placeholder="GV-GDTC-08"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên GV *</label>
                <input
                  type="text"
                  value={teacherNameInput}
                  onChange={(e) => setTeacherNameInput(e.target.value)}
                  placeholder="Nhập họ tên..."
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Google</label>
                <input
                  type="email"
                  value={teacherEmailInput}
                  onChange={(e) => setTeacherEmailInput(e.target.value)}
                  placeholder="email@gmail.com"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Điện thoại</label>
                <input
                  type="text"
                  value={teacherPhoneInput}
                  onChange={(e) => setTeacherPhoneInput(e.target.value)}
                  placeholder="098..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Chuyên môn</label>
                <input
                  type="text"
                  value={teacherSpecialtyInput}
                  onChange={(e) => setTeacherSpecialtyInput(e.target.value)}
                  placeholder="Bóng rổ, Cầu lông..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Lớp phụ trách</label>
                <input
                  type="text"
                  value={teacherClassesInput}
                  onChange={(e) => setTeacherClassesInput(e.target.value)}
                  placeholder="10A1, 12C1"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  className="flex-1 py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  {editingTeacherId ? 'Lưu Sửa' : '+ Thêm GV'}
                </button>
                {editingTeacherId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTeacherId(null);
                      setTeacherNameInput('');
                    }}
                    className="py-1.5 px-2 bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Bảng danh sách giáo viên */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManageTeachers}
                      checked={teachers.length > 0 && teachers.every(t => selectedTeacherIds.includes(t.id))}
                      onChange={() => {
                        if (teachers.every(t => selectedTeacherIds.includes(t.id))) {
                          setSelectedTeacherIds([]);
                        } else {
                          setSelectedTeacherIds(teachers.map(t => t.id));
                        }
                      }}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Mã GV</th>
                  <th className="p-3">Họ và Tên Giáo Viên</th>
                  <th className="p-3">Email Google</th>
                  <th className="p-3">Số điện thoại</th>
                  <th className="p-3">Chức vụ</th>
                  <th className="p-3">Chuyên môn</th>
                  <th className="p-3">Lớp phân công</th>
                  <th className="p-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => {
                  const isChecked = selectedTeacherIds.includes(t.id);
                  const isAdminEmail = isSuperAdminEmail(t.email);
                  return (
                    <tr key={t.id} className={`hover:bg-slate-50 ${isChecked ? 'bg-rose-50/50' : ''}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!canManageTeachers}
                          checked={isChecked}
                          onChange={() =>
                            setSelectedTeacherIds(prev =>
                              prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                            )
                          }
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-600">{t.code || '—'}</td>
                      <td className="p-3 font-bold text-slate-900">
                        {t.name}
                        {isAdminEmail && (
                          <span className="ml-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-1.5 py-0.2 rounded font-bold">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-700">{t.email || '—'}</td>
                      <td className="p-3">{t.phone || '—'}</td>
                      <td className="p-3">{t.position || 'Giáo viên GDTC'}</td>
                      <td className="p-3 text-emerald-800 font-medium">{t.specialty || '—'}</td>
                      <td className="p-3 font-semibold">{t.assignedClasses || '—'}</td>
                      <td className="p-3 text-center">
                        {canManageTeachers ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeacherId(t.id);
                                setTeacherCodeInput(t.code || '');
                                setTeacherNameInput(t.name);
                                setTeacherEmailInput(t.email || '');
                                setTeacherPhoneInput(t.phone || '');
                                setTeacherPositionInput(t.position || 'Giáo viên GDTC');
                                setTeacherSpecialtyInput(t.specialty || '');
                                setTeacherClassesInput(t.assignedClasses || '');
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 rounded font-semibold cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeacherIds([t.id])}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-semibold cursor-pointer"
                            >
                              Xoá
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 4: QUẢN TRỊ PHÂN QUYỀN & XÉT DUYỆT TÀI KHOẢN GOOGLE */}
      {/* ========================================================= */}
      {activeSubTab === 'rbac' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-5">
          {!canManageUsersAndRbac && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-900 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 font-semibold">
                <i className="fa-solid fa-shield-halved text-amber-600 text-base"></i>
                <span>
                  Chức năng Phân quyền hệ thống & Xét duyệt tài khoản chỉ dành cho Quản trị viên tối cao (<strong>boconglam@gmail.com</strong> hoặc <strong>tdtt.htp@gmail.com</strong>). Tài khoản hiện tại của bạn chỉ có quyền xem danh sách phân quyền.
                </span>
              </div>
              <button
                type="button"
                onClick={onGoogleLogin}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shrink-0"
              >
                Đăng nhập Google Admin
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <i className="fa-solid fa-user-shield text-emerald-700"></i>
                <span>Quản Trị Phân Quyền Hệ Thống & Xét Duyệt Tài Khoản Google</span>
              </h3>
              <p className="text-xs text-slate-500">
                2 Tài khoản Google Quản trị tối cao (Super Admin): <strong>boconglam@gmail.com</strong> và <strong>tdtt.htp@gmail.com</strong>
              </p>
            </div>
          </div>

          {/* Giải thích cơ chế bảo mật 2 lớp Google Admin */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
              <div className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                <i className="fa-solid fa-crown text-amber-500"></i>
                <span>Quyền Quản Trị Viên Hệ Thống (Super Admin)</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-emerald-900">
                <li>Xác thực trực tiếp qua 2 tài khoản Google: <strong>boconglam@gmail.com</strong> hoặc <strong>tdtt.htp@gmail.com</strong>.</li>
                <li>Toàn quyền xử lý dữ liệu hệ thống (Học sinh, Lớp học, Giáo viên, Nhật ký hoạt động).</li>
                <li>Nhận thông báo yêu cầu cấp quyền và phê duyệt / phân quyền chi tiết cho mọi tài khoản khác.</li>
              </ul>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2">
              <div className="font-bold text-blue-950 text-sm flex items-center gap-2">
                <i className="fa-solid fa-envelope-circle-check text-blue-600"></i>
                <span>Quy Trình Xét Duyệt Tài Khoản Người Dùng</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-blue-900">
                <li>Giáo viên / người dùng đăng nhập bằng tài khoản Google cá nhân.</li>
                <li>Hệ thống tự động tạo yêu cầu <strong>Chờ xét duyệt</strong> và gửi thông báo tới <strong>boconglam@gmail.com</strong> & <strong>tdtt.htp@gmail.com</strong>.</li>
                <li>Sau khi Admin bấm <strong>Phê duyệt</strong>, tài khoản mới được phép cập nhật dữ liệu.</li>
              </ul>
            </div>
          </div>

          {/* Danh sách thông báo yêu cầu xét duyệt gửi tới Admin */}
          {adminNotifications.filter(n => n.status !== 'resolved').length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2.5 text-xs">
              <h4 className="font-bold text-amber-950 flex items-center gap-2 text-sm">
                <i className="fa-solid fa-bell text-amber-600"></i>
                <span>Thông Báo Yêu Cầu Xét Duyệt Gửi Đến boconglam@gmail.com & tdtt.htp@gmail.com:</span>
              </h4>
              <div className="space-y-2">
                {adminNotifications.filter(n => n.status !== 'resolved').map(notif => (
                  <div key={notif.id} className="bg-white p-3 rounded-lg border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">
                        {notif.requesterName} ({notif.requesterEmail})
                      </p>
                      <p className="text-slate-600">{notif.message}</p>
                      <span className="text-[11px] text-slate-400">
                        Gửi lúc: {new Date(notif.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form cấp quyền trước cho Email Google (Dành cho Admin) */}
          {canManageUsersAndRbac && (
            <form onSubmit={handlePreApproveEmail} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <i className="fa-solid fa-user-plus text-emerald-700"></i>
                <span>Cấp Quyền Trước Cho Tài Khoản Google (Admin Whitelist):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Email Google cần cấp quyền *</label>
                  <input
                    type="email"
                    value={preApproveEmail}
                    onChange={(e) => setPreApproveEmail(e.target.value)}
                    placeholder="giaovien@gmail.com"
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Họ và tên hiển thị</label>
                  <input
                    type="text"
                    value={preApproveName}
                    onChange={(e) => setPreApproveName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Vai trò hệ thống</label>
                  <select
                    value={preApproveRole}
                    onChange={(e) => setPreApproveRole(e.target.value as UserAccountRole)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-bold"
                  >
                    <option value="gv">Giáo viên GDTC (Cập nhật dữ liệu)</option>
                    <option value="viewer">Cán bộ chỉ xem (Read-only)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="py-1.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  + Cấp Quyền Ngay
                </button>
              </div>
            </form>
          )}

          {/* Bảng danh sách tài khoản Google trong hệ thống */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Tài Khoản Google</th>
                  <th className="p-3">Trạng Thái Xét Duyệt</th>
                  <th className="p-3">Vai Trò Hệ Thống</th>
                  <th className="p-3">Phân Quyền Chi Tiết</th>
                  <th className="p-3">Người Duyệt</th>
                  <th className="p-3 text-center">Hành Động Quản Trị (Admin)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Luôn hiển thị 2 Super Admin mặc định ở đầu */}
                {SUPER_ADMIN_EMAILS.map((adminEmail) => {
                  const matched = allUserAccounts.find(u => u.email.toLowerCase() === adminEmail);
                  return (
                    <tr key={adminEmail} className="bg-amber-50/40">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <i className="fa-solid fa-crown text-amber-500"></i>
                          <span>{matched?.displayName || (adminEmail === 'boconglam@gmail.com' ? 'Bồ Công Lâm' : 'Tổ GDTC THPT Huỳnh Tấn Phát')}</span>
                        </div>
                        <span className="font-mono text-slate-600">{adminEmail}</span>
                      </td>
                      <td className="p-3">
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold text-[11px]">
                          ✓ Super Admin Mặc Định
                        </span>
                      </td>
                      <td className="p-3 font-bold text-amber-800">Quản trị tối cao (Admin)</td>
                      <td className="p-3 text-emerald-800 font-semibold">
                        Toàn quyền dữ liệu, Nhập Excel, Xoá hàng loạt, Phân quyền & Nhật ký
                      </td>
                      <td className="p-3 text-slate-500">Hệ thống gốc</td>
                      <td className="p-3 text-center text-slate-400 italic">Toàn quyền cố định</td>
                    </tr>
                  );
                })}

                {allUserAccounts
                  .filter(u => !isSuperAdminEmail(u.email))
                  .map((acc) => (
                    <tr key={acc.uid} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{acc.displayName || acc.email}</div>
                        <div className="font-mono text-slate-500">{acc.email}</div>
                      </td>
                      <td className="p-3">
                        {acc.status === 'approved' ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold text-[11px]">
                            ✓ Đã phê duyệt
                          </span>
                        ) : acc.status === 'pending' ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[11px] animate-pulse">
                            ⏳ Chờ Admin duyệt
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full font-bold text-[11px]">
                            ✕ Đã từ chối / Khóa
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {canManageUsersAndRbac ? (
                          <select
                            value={acc.role}
                            onChange={(e) => {
                              const newRole = e.target.value as UserAccountRole;
                              onAdminUpdateUser(
                                {
                                  ...acc,
                                  role: newRole,
                                  canManageUsers: newRole === 'admin'
                                },
                                `Thay đổi vai trò của ${acc.email} thành ${newRole.toUpperCase()}`
                              );
                            }}
                            className="bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-800"
                          >
                            <option value="gv">Giáo viên GDTC</option>
                            <option value="viewer">Chỉ xem (Viewer)</option>
                            <option value="hs">Học sinh</option>
                            <option value="admin">Quản trị viên (Admin)</option>
                          </select>
                        ) : (
                          <span className="font-bold">{acc.role.toUpperCase()}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!canManageUsersAndRbac}
                              checked={Boolean(acc.canManageStudents)}
                              onChange={(e) =>
                                onAdminUpdateUser(
                                  { ...acc, canManageStudents: e.target.checked },
                                  `Cập nhật quyền quản lý Học sinh cho ${acc.email}: ${e.target.checked ? 'Cho phép' : 'Thu hồi'}`
                                )
                              }
                              className="accent-emerald-600"
                            />
                            <span>Học sinh</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!canManageUsersAndRbac}
                              checked={Boolean(acc.canManageClasses)}
                              onChange={(e) =>
                                onAdminUpdateUser(
                                  { ...acc, canManageClasses: e.target.checked },
                                  `Cập nhật quyền quản lý Lớp học cho ${acc.email}: ${e.target.checked ? 'Cho phép' : 'Thu hồi'}`
                                )
                              }
                              className="accent-emerald-600"
                            />
                            <span>Lớp học</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!canManageUsersAndRbac}
                              checked={Boolean(acc.canManageTeachers)}
                              onChange={(e) =>
                                onAdminUpdateUser(
                                  { ...acc, canManageTeachers: e.target.checked },
                                  `Cập nhật quyền quản lý Giáo viên cho ${acc.email}: ${e.target.checked ? 'Cho phép' : 'Thu hồi'}`
                                )
                              }
                              className="accent-emerald-600"
                            />
                            <span>Giáo viên</span>
                          </label>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500">{acc.approvedBy || '—'}</td>
                      <td className="p-3 text-center">
                        {canManageUsersAndRbac ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {acc.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAdminUpdateUser(
                                    {
                                      ...acc,
                                      status: 'approved' as UserAccountStatus,
                                      canManageStudents: true,
                                      canManageClasses: true
                                    },
                                    `Phê duyệt cấp quyền truy cập hệ thống cho tài khoản ${acc.email}`
                                  )
                                }
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded cursor-pointer"
                              >
                                Phê duyệt
                              </button>
                            )}
                            {acc.status !== 'rejected' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAdminUpdateUser(
                                    { ...acc, status: 'rejected' as UserAccountStatus },
                                    `Từ chối / Khóa quyền truy cập của tài khoản ${acc.email}`
                                  )
                                }
                                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded cursor-pointer"
                              >
                                Khóa / Từ chối
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onAdminDeleteUser(acc)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded cursor-pointer"
                            >
                              Xoá
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chỉ Admin mới được duyệt</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 5: NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG (AUDIT LOGS)         */}
      {/* ========================================================= */}
      {activeSubTab === 'audit' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-emerald-700"></i>
                <span>Nhật Ký Hoạt Động Hệ Thống (Ghi Tự Động Mọi Tác Vụ Sửa, Xoá, Thay Đổi Dữ Liệu)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Theo dõi minh bạch thời gian thực người thực hiện, email tài khoản, nội dung thêm, sửa, xoá, nhập Excel và phân quyền
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportAuditLogsExcel}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <i className="fa-solid fa-file-excel"></i>
                <span>Xuất Nhật Ký Ra Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Bộ lọc Nhật ký */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Loại tác vụ:</span>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  <option value="all">Tất cả tác vụ ({auditLogs.length})</option>
                  <option value="CREATE">Thêm mới (CREATE)</option>
                  <option value="UPDATE">Sửa / Cập nhật (UPDATE)</option>
                  <option value="DELETE">Xoá đơn lẻ (DELETE)</option>
                  <option value="BULK_DELETE">Xoá hàng loạt (BULK_DELETE)</option>
                  <option value="IMPORT_EXCEL">Nhập từ Excel (IMPORT_EXCEL)</option>
                  <option value="PERMISSION_CHANGE">Phân quyền / Duyệt TK (PERMISSION)</option>
                  <option value="AUTH">Đăng nhập / Xác thực (AUTH)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Đối tượng dữ liệu:</span>
                <select
                  value={auditEntityFilter}
                  onChange={(e) => setAuditEntityFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  <option value="all">Tất cả đối tượng</option>
                  <option value="HOC_SINH">Danh sách Học sinh</option>
                  <option value="LOP_HOC">Danh sách Lớp học</option>
                  <option value="GIAO_VIEN">Danh sách Giáo viên</option>
                  <option value="TAI_KHOAN">Tài khoản & Phân quyền</option>
                  <option value="HE_THONG">Hệ thống</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Tìm người thực hiện, nội dung sửa/xoá..."
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-64"
            />
          </div>

          {/* Bảng Nhật ký hoạt động */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="p-3 whitespace-nowrap">Thời Gian</th>
                  <th className="p-3 whitespace-nowrap">Người Thực Hiện</th>
                  <th className="p-3 whitespace-nowrap">Tác Vụ</th>
                  <th className="p-3 whitespace-nowrap">Phân Hệ</th>
                  <th className="p-3">Nội Dung Tác Vụ & Chi Tiết Thay Đổi Dữ Liệu</th>
                  {isSuperAdmin && <th className="p-3 text-center">Quản lý</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 6 : 5} className="p-6 text-center text-slate-500">
                      Chưa có bản ghi nhật ký hoạt động nào khớp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => {
                    const badgeStyle =
                      log.actionType === 'DELETE' || log.actionType === 'BULK_DELETE'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : log.actionType === 'UPDATE'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : log.actionType === 'IMPORT_EXCEL' || log.actionType === 'CREATE'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : log.actionType === 'PERMISSION_CHANGE'
                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300';

                    const actionLabel =
                      log.actionType === 'CREATE'
                        ? 'Thêm mới'
                        : log.actionType === 'UPDATE'
                        ? 'Sửa đổi'
                        : log.actionType === 'DELETE'
                        ? 'Xoá'
                        : log.actionType === 'BULK_DELETE'
                        ? 'Xoá hàng loạt'
                        : log.actionType === 'IMPORT_EXCEL'
                        ? 'Nhập Excel'
                        : log.actionType === 'PERMISSION_CHANGE'
                        ? 'Phân quyền'
                        : 'Xác thực';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{log.actorName || 'Giáo viên'}</div>
                          <div className="font-mono text-[11px] text-slate-500">{log.actorEmail}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeStyle}`}>
                            {actionLabel}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold text-slate-700">
                          {log.targetEntity === 'HOC_SINH'
                            ? 'Học sinh'
                            : log.targetEntity === 'LOP_HOC'
                            ? 'Lớp học'
                            : log.targetEntity === 'GIAO_VIEN'
                            ? 'Giáo viên'
                            : log.targetEntity === 'TAI_KHOAN'
                            ? 'Tài khoản'
                            : 'Hệ thống'}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{log.summary}</div>
                          {log.details && (
                            <div className="text-[11px] text-slate-600 mt-0.5">{log.details}</div>
                          )}
                        </td>
                        {isSuperAdmin && (
                          <td className="p-3 text-center">
                            {onDeleteAuditLog && (
                              <button
                                type="button"
                                onClick={() => onDeleteAuditLog(log.id)}
                                className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Xoá dòng nhật ký này"
                              >
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nhập Học Sinh Từ Excel */}
      <ImportStudentsModal
        isOpen={isImportStudentsOpen}
        onClose={() => setIsImportStudentsOpen(false)}
        currentCount={students.length}
        onImport={(imported, replaceAll) => {
          const next = replaceAll ? imported : [...imported, ...students];
          onUpdateStudents(next, {
            actionType: 'IMPORT_EXCEL',
            summary: `Nhập ${imported.length} học sinh từ tệp Excel (${replaceAll ? 'Thay thế toàn bộ' : 'Bổ sung'})`,
            details: `Danh sách lớp nhập: ${Array.from(new Set(imported.map(s => s.class))).join(', ')}. Tổng sĩ số sau khi nhập: ${next.length} HS.`
          });
          onShowToast(`Đã nhập thành công ${imported.length} học sinh từ Excel!`);
        }}
      />

      {/* Modal Sửa Học Sinh */}
      {editingStudent && (
        <EditStudentModal
          isOpen={!!editingStudent}
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSave={(updatedStudent) => {
            const next = students.map(s => (s.id === updatedStudent.id ? updatedStudent : s));
            onUpdateStudents(next, {
              actionType: 'UPDATE',
              summary: `Sửa hồ sơ học sinh ${updatedStudent.name} (Lớp ${updatedStudent.class})`,
              details: `Mã HS: ${updatedStudent.code} • Cao: ${updatedStudent.heightCm}cm, Nặng: ${updatedStudent.weightKg}kg, BMI: ${updatedStudent.bmi} • Ghi chú: ${updatedStudent.medicalNote}`
            });
            setEditingStudent(null);
            onShowToast(`Đã lưu thay đổi học sinh ${updatedStudent.name}!`);
          }}
        />
      )}
    </div>
  );
};
