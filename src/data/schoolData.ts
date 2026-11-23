import { ClassRoomProfile, TeacherProfile } from '../types';

export const SUPER_ADMIN_EMAILS = ['boconglam@gmail.com', 'tdtt.htp@gmail.com'];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const INITIAL_CLASSES: ClassRoomProfile[] = [
  {
    id: 'class-10A1',
    name: '10A1',
    grade: '10',
    homeroomTeacher: 'Nguyễn Văn Minh',
    peTeacher: 'Bồ Công Lâm',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Bóng rổ & Bóng chuyền'
  },
  {
    id: 'class-10A3',
    name: '10A3',
    grade: '10',
    homeroomTeacher: 'Trần Thị Thu Hà',
    peTeacher: 'Nguyễn Trung Hiếu',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Bóng chuyền & Cầu lông'
  },
  {
    id: 'class-11B1',
    name: '11B1',
    grade: '11',
    homeroomTeacher: 'Lê Hoàng Nam',
    peTeacher: 'Bùi Thanh Liêm',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Bóng rổ nâng cao'
  },
  {
    id: 'class-12C1',
    name: '12C1',
    grade: '12',
    homeroomTeacher: 'Phạm Thị Ngọc Du',
    peTeacher: 'Bồ Công Lâm',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Bóng rổ & Chiến thuật thi đấu'
  },
  {
    id: 'class-12C2',
    name: '12C2',
    grade: '12',
    homeroomTeacher: 'Cao Minh Thắng',
    peTeacher: 'Cao Minh Thắng',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Bóng chuyền & Cầu lông'
  },
  {
    id: 'class-12C3',
    name: '12C3',
    grade: '12',
    homeroomTeacher: 'Võ Thị Yến Lan',
    peTeacher: 'Võ Thị Yến Lan',
    schoolYear: '2025 - 2026',
    note: 'Phân môn Cầu lông & Đá cầu'
  }
];

export const INITIAL_TEACHERS: TeacherProfile[] = [
  {
    id: 'gv-bo-cong-lam',
    code: 'GV-GDTC-01',
    name: 'Bồ Công Lâm',
    email: 'boconglam@gmail.com',
    phone: '0984511901',
    position: 'Quản trị hệ thống / Giáo viên GDTC',
    specialty: 'Bóng rổ, Bóng chuyền, Chuyển đổi số AI',
    assignedClasses: '10A1, 12C1'
  },
  {
    id: 'gv-nguyen-tan-phuoc',
    code: 'GV-GDTC-02',
    name: 'Nguyễn Tấn Phước',
    email: 'tdtt.htp@gmail.com',
    phone: '0918234567',
    position: 'Giáo viên GDTC',
    specialty: 'Bóng chuyền, Điền kinh',
    assignedClasses: '10A2, 11B2'
  },
  {
    id: 'gv-nguyen-trung-hieu',
    code: 'GV-GDTC-03',
    name: 'Nguyễn Trung Hiếu',
    email: 'trunghieu.htp@gmail.com',
    phone: '0919345678',
    position: 'Giáo viên GDTC',
    specialty: 'Bóng rổ, Cầu lông',
    assignedClasses: '10A3, 12C1'
  },
  {
    id: 'gv-bui-thanh-liem',
    code: 'GV-GDTC-04',
    name: 'Bùi Thanh Liêm',
    email: 'thanhliem.htp@gmail.com',
    phone: '0907456789',
    position: 'Giáo viên GDTC',
    specialty: 'Bóng đá, Bóng chuyền',
    assignedClasses: '11B1, 11B3'
  },
  {
    id: 'gv-cao-minh-thang',
    code: 'GV-GDTC-05',
    name: 'Cao Minh Thắng',
    email: 'minhthang.htp@gmail.com',
    phone: '0939567890',
    position: 'Giáo viên GDTC',
    specialty: 'Cầu lông, Đá cầu',
    assignedClasses: '12C2, 10A4'
  },
  {
    id: 'gv-pham-thi-ngoc-du',
    code: 'GV-GDTC-06',
    name: 'Phạm Thị Ngọc Du',
    email: 'ngocdu.htp@gmail.com',
    phone: '0945678901',
    position: 'Giáo viên GDTC',
    specialty: 'Cầu lông, Thể dục nhịp điệu',
    assignedClasses: '10A5, 11B4'
  },
  {
    id: 'gv-vo-thi-yen-lan',
    code: 'GV-GDTC-07',
    name: 'Võ Thị Yến Lan',
    email: 'yenlan.htp@gmail.com',
    phone: '0978789012',
    position: 'Giáo viên GDTC',
    specialty: 'Đá cầu, Cầu lông',
    assignedClasses: '12C3, 11B5'
  }
];
