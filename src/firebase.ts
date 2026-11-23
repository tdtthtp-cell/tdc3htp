import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import {
  StudentProfile,
  ClassRoomProfile,
  TeacherProfile,
  UserAccount,
  AdminNotification,
  AuditLogEntry,
  AuditActionType,
  AuditTargetEntity,
  GradeLevel
} from './types';
import { isSuperAdminEmail, SUPER_ADMIN_EMAILS } from './data/schoolData';
import firebaseConfig from '../firebase-applet-config.json';

// Khởi tạo Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Phải truyền đúng databaseId từ cấu hình
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper: Chuẩn hóa ID hợp lệ với regex ^[a-zA-Z0-9_\-]+$ và maxLength 128
export function sanitizeFirestoreId(rawId: string, prefix = 'id'): string {
  const cleaned = (rawId || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 110);
  return cleaned || `${prefix}-${Date.now()}`;
}

function truncateStr(val: string | undefined | null, maxLen: number): string {
  if (!val) return '';
  return String(val).trim().slice(0, maxLen);
}

// Kiểm tra kết nối khi khởi động
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is currently offline.');
    }
  }
}

// =========================================================
// 1. GOOGLE AUTHENTICATION & ADMIN APPROVAL WORKFLOW
// =========================================================

export async function signInWithGoogleAccount(): Promise<{
  firebaseUser: User;
  userAccount: UserAccount;
  isNewPendingRequest: boolean;
}> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;
  const email = (fbUser.email || '').trim().toLowerCase();
  const uid = sanitizeFirestoreId(fbUser.uid, 'u');
  const isSuper = isSuperAdminEmail(email);

  const userRef = doc(db, 'users', uid);

  if (isSuper) {
    const adminAccount: UserAccount = {
      uid,
      email: truncateStr(email, 120),
      displayName: truncateStr(fbUser.displayName || (email === 'boconglam@gmail.com' ? 'Bồ Công Lâm' : 'Quản Trị Viên GDTC'), 100),
      photoURL: truncateStr(fbUser.photoURL || '', 500),
      role: 'admin',
      status: 'approved',
      canManageStudents: true,
      canManageClasses: true,
      canManageTeachers: true,
      canManageUsers: true,
      approvedBy: email,
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await setDoc(userRef, adminAccount);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }

    await recordAuditLog({
      actionType: 'AUTH',
      targetEntity: 'HE_THONG',
      summary: `Admin đăng nhập xác thực Google: ${email}`,
      details: `Quản trị viên hệ thống (${adminAccount.displayName} - ${email}) đã đăng nhập với toàn quyền quản trị.`,
      actorName: adminAccount.displayName,
      actorEmail: email
    });

    return {
      firebaseUser: fbUser,
      userAccount: adminAccount,
      isNewPendingRequest: false
    };
  }

  // Tài khoản thường: kiểm tra hồ sơ trong /users/{uid}
  let existingDoc;
  try {
    existingDoc = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  if (existingDoc && existingDoc.exists()) {
    const data = existingDoc.data() as UserAccount;
    await recordAuditLog({
      actionType: 'AUTH',
      targetEntity: 'TAI_KHOAN',
      summary: `Đăng nhập Google: ${email} (Trạng thái: ${data.status === 'approved' ? 'Đã duyệt' : data.status === 'pending' ? 'Chờ duyệt' : 'Từ chối'})`,
      details: `Tài khoản ${data.displayName || email} đăng nhập vào hệ thống với vai trò ${data.role}.`,
      actorName: data.displayName || email,
      actorEmail: email
    });
    return {
      firebaseUser: fbUser,
      userAccount: data,
      isNewPendingRequest: data.status === 'pending'
    };
  }

  // Tạo tài khoản mới ở trạng thái chờ Admin xét duyệt (status: 'pending')
  const newPendingAccount: UserAccount = {
    uid,
    email: truncateStr(email, 120),
    displayName: truncateStr(fbUser.displayName || email.split('@')[0], 100),
    photoURL: truncateStr(fbUser.photoURL || '', 500),
    role: 'gv',
    status: 'pending',
    canManageStudents: true,
    canManageClasses: false,
    canManageTeachers: false,
    canManageUsers: false,
    approvedBy: '',
    requestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(userRef, newPendingAccount);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
  }

  // Tạo thông báo gửi đến 2 tài khoản Admin: boconglam@gmail.com và tdtt.htp@gmail.com
  const notifId = sanitizeFirestoreId(`notif-${uid}`, 'notif');
  const notifRef = doc(db, 'admin_notifications', notifId);
  const notificationPayload: AdminNotification = {
    id: notifId,
    requesterUid: uid,
    requesterEmail: truncateStr(email, 120),
    requesterName: truncateStr(newPendingAccount.displayName || email, 100),
    targetAdmins: SUPER_ADMIN_EMAILS.join(', '),
    message: truncateStr(
      `Tài khoản Google ${newPendingAccount.displayName} (${email}) yêu cầu cấp quyền truy cập hệ thống GDTC THPT Huỳnh Tấn Phát. Cần Admin (${SUPER_ADMIN_EMAILS.join(' hoặc ')}) phê duyệt.`,
      500
    ),
    status: 'unread',
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(notifRef, notificationPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admin_notifications/${notifId}`);
  }

  await recordAuditLog({
    actionType: 'AUTH',
    targetEntity: 'TAI_KHOAN',
    summary: `Yêu cầu xét duyệt tài khoản mới: ${email}`,
    details: `Đã gửi thông báo xét duyệt đến Admin (${SUPER_ADMIN_EMAILS.join(', ')}) cho tài khoản ${newPendingAccount.displayName} (${email}).`,
    actorName: newPendingAccount.displayName,
    actorEmail: email
  });

  return {
    firebaseUser: fbUser,
    userAccount: newPendingAccount,
    isNewPendingRequest: true
  };
}

export async function signOutGoogleAccount(): Promise<void> {
  await signOut(auth);
}

// Lắng nghe hồ sơ tài khoản hiện tại
export function subscribeUserAccountByUid(
  uid: string,
  onSuccess: (account: UserAccount | null) => void
) {
  const cleanUid = sanitizeFirestoreId(uid, 'u');
  const path = `users/${cleanUid}`;
  return onSnapshot(
    doc(db, 'users', cleanUid),
    (snap) => {
      if (snap.exists()) {
        onSuccess(snap.data() as UserAccount);
      } else {
        onSuccess(null);
      }
    },
    (err) => {
      console.warn('Không thể lắng nghe hồ sơ người dùng:', err);
    }
  );
}

// Lắng nghe toàn bộ danh sách tài khoản trong hệ thống (Dành cho Admin)
export function subscribeAllUserAccounts(
  onSuccess: (accounts: UserAccount[]) => void
) {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const list: UserAccount[] = [];
      snap.forEach((d) => {
        list.push(d.data() as UserAccount);
      });
      list.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
      onSuccess(list);
    },
    (err) => {
      console.warn('Lưu ý lắng nghe danh sách users:', err);
    }
  );
}

// Admin phê duyệt, từ chối hoặc phân quyền cho tài khoản
export async function updateUserAccountByAdmin(
  account: UserAccount,
  adminEmail: string
): Promise<void> {
  const cleanUid = sanitizeFirestoreId(account.uid, 'u');
  const path = `users/${cleanUid}`;
  const payload: UserAccount = {
    uid: cleanUid,
    email: truncateStr(account.email, 120),
    displayName: truncateStr(account.displayName || account.email, 100),
    photoURL: truncateStr(account.photoURL || '', 500),
    role: account.role,
    status: account.status,
    canManageStudents: Boolean(account.canManageStudents),
    canManageClasses: Boolean(account.canManageClasses),
    canManageTeachers: Boolean(account.canManageTeachers),
    canManageUsers: account.role === 'admin' ? true : Boolean(account.canManageUsers),
    approvedBy: truncateStr(adminEmail, 120),
    requestedAt: truncateStr(account.requestedAt || new Date().toISOString(), 50),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'users', cleanUid), payload);
    // Đồng thời đánh dấu thông báo liên quan là resolved
    const notifId = sanitizeFirestoreId(`notif-${cleanUid}`, 'notif');
    await setDoc(
      doc(db, 'admin_notifications', notifId),
      {
        id: notifId,
        requesterUid: cleanUid,
        requesterEmail: payload.email,
        requesterName: payload.displayName || payload.email,
        targetAdmins: SUPER_ADMIN_EMAILS.join(', '),
        message: `Đã xử lý bởi Admin ${adminEmail}: Trạng thái ${payload.status}, Quyền ${payload.role}`,
        status: 'resolved',
        createdAt: payload.requestedAt || new Date().toISOString()
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserAccountByAdmin(uid: string): Promise<void> {
  const cleanUid = sanitizeFirestoreId(uid, 'u');
  const path = `users/${cleanUid}`;
  try {
    await deleteDoc(doc(db, 'users', cleanUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Lắng nghe thông báo xét duyệt tài khoản gửi tới Admin
export function subscribeAdminNotifications(
  onSuccess: (notifications: AdminNotification[]) => void
) {
  const path = 'admin_notifications';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const list: AdminNotification[] = [];
      snap.forEach((d) => {
        list.push(d.data() as AdminNotification);
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onSuccess(list);
    },
    (err) => {
      console.warn('Lưu ý lắng nghe admin_notifications:', err);
    }
  );
}

// =========================================================
// 2. STUDENTS MANAGEMENT (SYNC, EXCEL IMPORT, BULK DELETE)
// =========================================================

export function subscribeStudentsFromCloud(
  onSuccess: (students: StudentProfile[]) => void,
  onError?: (err: unknown) => void
) {
  const path = 'students';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) {
        return;
      }
      const remoteList: StudentProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        remoteList.push({
          id: d.id,
          code: data.code || `HS-${d.id}`,
          name: data.name || '',
          class: data.class || '12C1',
          gender: data.gender === 'Nữ' ? 'Nữ' : 'Nam',
          heightCm: Number(data.heightCm) || 165,
          weightKg: Number(data.weightKg) || 55,
          bmi: Number(data.bmi) || 20,
          status: data.status || 'standard',
          medicalNote: data.medicalNote || '',
          evalTech: data.evalTech || '',
          evalAttitude: data.evalAttitude || '',
          evalDigital: data.evalDigital || '',
          rating: data.rating === 'Chưa đạt' ? 'Chưa đạt' : 'Đạt',
          parentPhone: data.parentPhone || ''
        });
      });
      if (remoteList.length > 0) {
        onSuccess(remoteList);
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function saveStudentToCloud(student: StudentProfile): Promise<void> {
  if (!auth.currentUser) return;
  const cleanId = sanitizeFirestoreId(student.id, 'st');
  const path = `students/${cleanId}`;
  try {
    const studentRef = doc(db, 'students', cleanId);
    const payload = {
      id: cleanId,
      code: truncateStr(student.code || '', 50),
      name: truncateStr(student.name || 'Học sinh', 100),
      class: truncateStr(student.class || '10A1', 20),
      gender: student.gender === 'Nữ' ? 'Nữ' : 'Nam',
      heightCm: Math.min(260, Math.max(50, Number(student.heightCm) || 165)),
      weightKg: Math.min(250, Math.max(15, Number(student.weightKg) || 55)),
      bmi: Math.min(100, Math.max(5, Number(student.bmi) || 20)),
      status: ['standard', 'overweight', 'underweight', 'mild'].includes(student.status) ? student.status : 'standard',
      medicalNote: truncateStr(student.medicalNote || '', 500),
      evalTech: truncateStr(student.evalTech || '', 500),
      evalAttitude: truncateStr(student.evalAttitude || '', 500),
      evalDigital: truncateStr(student.evalDigital || '', 500),
      rating: truncateStr(student.rating || 'Đạt', 50),
      parentPhone: truncateStr(student.parentPhone || '', 30),
      updatedAt: new Date().toISOString()
    };
    await setDoc(studentRef, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncAllStudentsToCloud(students: StudentProfile[]): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'students';
  try {
    // Chia theo lô tối đa 400 bản ghi mỗi batch
    const chunkSize = 400;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((student) => {
        const cleanId = sanitizeFirestoreId(student.id, 'st');
        const studentRef = doc(db, 'students', cleanId);
        batch.set(studentRef, {
          id: cleanId,
          code: truncateStr(student.code || '', 50),
          name: truncateStr(student.name || 'Học sinh', 100),
          class: truncateStr(student.class || '10A1', 20),
          gender: student.gender === 'Nữ' ? 'Nữ' : 'Nam',
          heightCm: Math.min(260, Math.max(50, Number(student.heightCm) || 165)),
          weightKg: Math.min(250, Math.max(15, Number(student.weightKg) || 55)),
          bmi: Math.min(100, Math.max(5, Number(student.bmi) || 20)),
          status: ['standard', 'overweight', 'underweight', 'mild'].includes(student.status) ? student.status : 'standard',
          medicalNote: truncateStr(student.medicalNote || '', 500),
          evalTech: truncateStr(student.evalTech || '', 500),
          evalAttitude: truncateStr(student.evalAttitude || '', 500),
          evalDigital: truncateStr(student.evalDigital || '', 500),
          rating: truncateStr(student.rating || 'Đạt', 50),
          parentPhone: truncateStr(student.parentPhone || '', 30),
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteStudentsBatchFromCloud(studentIds: string[]): Promise<void> {
  if (!auth.currentUser || studentIds.length === 0) return;
  const path = 'students';
  try {
    const chunkSize = 400;
    for (let i = 0; i < studentIds.length; i += chunkSize) {
      const chunk = studentIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((rawId) => {
        const cleanId = sanitizeFirestoreId(rawId, 'st');
        batch.delete(doc(db, 'students', cleanId));
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// =========================================================
// 3. CLASSES MANAGEMENT (SYNC, EXCEL IMPORT, BULK DELETE)
// =========================================================

export function subscribeClassesFromCloud(
  onSuccess: (classes: ClassRoomProfile[]) => void
) {
  const path = 'classes';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) return;
      const list: ClassRoomProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || d.id,
          grade: (['10', '11', '12'].includes(data.grade) ? data.grade : '10') as GradeLevel,
          homeroomTeacher: data.homeroomTeacher || '',
          peTeacher: data.peTeacher || '',
          schoolYear: data.schoolYear || '2025 - 2026',
          note: data.note || '',
          updatedAt: data.updatedAt || ''
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length > 0) {
        onSuccess(list);
      }
    },
    (err) => {
      console.warn('Lưu ý kết nối classes:', err);
    }
  );
}

export async function syncAllClassesToCloud(classes: ClassRoomProfile[]): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'classes';
  try {
    const batch = writeBatch(db);
    classes.forEach((cls) => {
      const cleanId = sanitizeFirestoreId(cls.id || `class-${cls.name}`, 'class');
      const ref = doc(db, 'classes', cleanId);
      batch.set(ref, {
        id: cleanId,
        name: truncateStr(cls.name || '10A1', 30),
        grade: ['10', '11', '12'].includes(cls.grade) ? cls.grade : '10',
        homeroomTeacher: truncateStr(cls.homeroomTeacher || '', 100),
        peTeacher: truncateStr(cls.peTeacher || '', 100),
        schoolYear: truncateStr(cls.schoolYear || '2025 - 2026', 30),
        note: truncateStr(cls.note || '', 300),
        updatedAt: new Date().toISOString()
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteClassesBatchFromCloud(classIds: string[]): Promise<void> {
  if (!auth.currentUser || classIds.length === 0) return;
  const path = 'classes';
  try {
    const batch = writeBatch(db);
    classIds.forEach((rawId) => {
      const cleanId = sanitizeFirestoreId(rawId, 'class');
      batch.delete(doc(db, 'classes', cleanId));
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// =========================================================
// 4. TEACHERS MANAGEMENT (SYNC, EXCEL IMPORT, BULK DELETE)
// =========================================================

export function subscribeTeachersFromCloud(
  onSuccess: (teachers: TeacherProfile[]) => void
) {
  const path = 'teachers';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      if (snapshot.empty) return;
      const list: TeacherProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          code: data.code || '',
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          position: data.position || 'Giáo viên GDTC',
          specialty: data.specialty || '',
          assignedClasses: data.assignedClasses || '',
          updatedAt: data.updatedAt || ''
        });
      });
      if (list.length > 0) {
        onSuccess(list);
      }
    },
    (err) => {
      console.warn('Lưu ý kết nối teachers:', err);
    }
  );
}

export async function syncAllTeachersToCloud(teachers: TeacherProfile[]): Promise<void> {
  if (!auth.currentUser) return;
  const path = 'teachers';
  try {
    const batch = writeBatch(db);
    teachers.forEach((t) => {
      const cleanId = sanitizeFirestoreId(t.id || `gv-${t.name}`, 'gv');
      const ref = doc(db, 'teachers', cleanId);
      batch.set(ref, {
        id: cleanId,
        code: truncateStr(t.code || '', 50),
        name: truncateStr(t.name || 'Giáo viên', 100),
        email: truncateStr(t.email || '', 120),
        phone: truncateStr(t.phone || '', 30),
        position: truncateStr(t.position || 'Giáo viên GDTC', 80),
        specialty: truncateStr(t.specialty || '', 120),
        assignedClasses: truncateStr(t.assignedClasses || '', 200),
        updatedAt: new Date().toISOString()
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteTeachersBatchFromCloud(teacherIds: string[]): Promise<void> {
  if (!auth.currentUser || teacherIds.length === 0) return;
  const path = 'teachers';
  try {
    const batch = writeBatch(db);
    teacherIds.forEach((rawId) => {
      const cleanId = sanitizeFirestoreId(rawId, 'gv');
      batch.delete(doc(db, 'teachers', cleanId));
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// =========================================================
// 5. AUDIT LOGS (NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG)
// =========================================================

export function getLocalAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem('edusport_audit_logs');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveLocalAuditLog(entry: AuditLogEntry) {
  try {
    const current = getLocalAuditLogs();
    const updated = [entry, ...current.filter(x => x.id !== entry.id)].slice(0, 500);
    localStorage.setItem('edusport_audit_logs', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('edusport-audit-log-updated'));
  } catch {
    // ignore
  }
}

export async function recordAuditLog(params: {
  actionType: AuditActionType;
  targetEntity: AuditTargetEntity;
  summary: string;
  details?: string;
  actorName?: string;
  actorEmail?: string;
}): Promise<AuditLogEntry> {
  const currentUser = auth.currentUser;
  const rawId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanId = sanitizeFirestoreId(rawId, 'log');
  const email = truncateStr(
    params.actorEmail || currentUser?.email || localStorage.getItem('edusport_auth_email') || 'system@htp.edu.vn',
    120
  );
  const name = truncateStr(
    params.actorName || currentUser?.displayName || localStorage.getItem('edusport_user_name') || 'Quản trị viên / GV',
    100
  );

  const entry: AuditLogEntry = {
    id: cleanId,
    actionType: params.actionType,
    targetEntity: params.targetEntity,
    actorUid: sanitizeFirestoreId(currentUser?.uid || 'local-user', 'u'),
    actorEmail: email,
    actorName: name,
    summary: truncateStr(params.summary, 300),
    details: truncateStr(params.details || '', 1500),
    timestamp: new Date().toISOString()
  };

  // Lưu ngay vào bộ nhớ cục bộ để giao diện cập nhật tức thì
  saveLocalAuditLog(entry);

  // Nếu đã đăng nhập Google, đồng bộ nhật ký lên Firestore
  if (currentUser && currentUser.email) {
    const path = `audit_logs/${cleanId}`;
    try {
      await setDoc(doc(db, 'audit_logs', cleanId), {
        ...entry,
        actorEmail: truncateStr(currentUser.email, 120)
      });
    } catch (err) {
      console.warn('Lưu nhật ký lên Cloud:', err);
    }
  }

  return entry;
}

export function subscribeAuditLogsFromCloud(
  onSuccess: (logs: AuditLogEntry[]) => void
) {
  const path = 'audit_logs';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: AuditLogEntry[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as AuditLogEntry);
      });
      list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      onSuccess(list);
    },
    (err) => {
      console.warn('Lưu ý kết nối audit_logs:', err);
    }
  );
}

export async function deleteAuditLogFromCloud(logId: string): Promise<void> {
  const cleanId = sanitizeFirestoreId(logId, 'log');
  try {
    const local = getLocalAuditLogs().filter(l => l.id !== cleanId);
    localStorage.setItem('edusport_audit_logs', JSON.stringify(local));
    window.dispatchEvent(new CustomEvent('edusport-audit-log-updated'));
    if (auth.currentUser) {
      await deleteDoc(doc(db, 'audit_logs', cleanId));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `audit_logs/${cleanId}`);
  }
}
