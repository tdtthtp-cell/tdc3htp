/**
 * Phase 0: Payload-First Security TDD Test Suite for firestore.rules
 * Verifies that all "Dirty Dozen" payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'delete' | 'get';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unverified Admin Email Spoof',
    collection: 'users',
    docId: 'target_user_1',
    operation: 'update',
    auth: { uid: 'spoof_admin', email: 'boconglam@gmail.com', email_verified: false },
    payload: { status: 'approved', role: 'admin' },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Role on Registration',
    collection: 'users',
    docId: 'user_2',
    operation: 'create',
    auth: { uid: 'user_2', email: 'teacher2@gmail.com', email_verified: true },
    payload: {
      uid: 'user_2',
      email: 'teacher2@gmail.com',
      displayName: 'Malicious User',
      role: 'admin',
      status: 'approved',
      canManageStudents: true,
      canManageClasses: true,
      canManageTeachers: true,
      canManageUsers: true
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Cross-User Profile Hijack',
    collection: 'users',
    docId: 'user_3',
    operation: 'create',
    auth: { uid: 'user_2', email: 'teacher2@gmail.com', email_verified: true },
    payload: {
      uid: 'user_3',
      email: 'victim@gmail.com',
      role: 'gv',
      status: 'pending'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Student',
    collection: 'students',
    docId: 'st_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'tdtt.htp@gmail.com', email_verified: true },
    payload: {
      id: 'st_1',
      name: 'Nguyen Van A',
      class: '10A1',
      gender: 'Nam',
      heightCm: 170,
      weightKg: 60,
      bmi: 20.8,
      status: 'standard',
      ghostField: 'injected'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Oversized String DoW Attack on Student',
    collection: 'students',
    docId: 'st_2',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'tdtt.htp@gmail.com', email_verified: true },
    payload: {
      id: 'st_2',
      name: 'A'.repeat(500),
      class: '10A1',
      gender: 'Nam',
      heightCm: 170,
      weightKg: 60,
      bmi: 20.8,
      status: 'standard'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Invalid ID Poisoning',
    collection: 'students',
    docId: 'invalid$id!@#',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'tdtt.htp@gmail.com', email_verified: true },
    payload: {
      id: 'invalid$id!@#',
      name: 'Nguyen Van A',
      class: '10A1',
      gender: 'Nam',
      heightCm: 170,
      weightKg: 60,
      bmi: 20.8,
      status: 'standard'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Unapproved User Modifying Student Roster',
    collection: 'students',
    docId: 'st_1',
    operation: 'delete',
    auth: { uid: 'pending_user', email: 'guest@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Unapproved User Bulk Deleting Classes',
    collection: 'classes',
    docId: 'class_10A1',
    operation: 'delete',
    auth: { uid: 'pending_user', email: 'guest@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Unapproved User Modifying Teachers List',
    collection: 'teachers',
    docId: 'teacher_1',
    operation: 'create',
    auth: { uid: 'pending_user', email: 'guest@gmail.com', email_verified: true },
    payload: {
      id: 'teacher_1',
      name: 'Fake Teacher'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Audit Log Tampering (Update)',
    collection: 'audit_logs',
    docId: 'log_1',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'boconglam@gmail.com', email_verified: true },
    payload: {
      summary: 'Tampered summary'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Invalid Enum Value on ClassRoom',
    collection: 'classes',
    docId: 'class_13A1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'boconglam@gmail.com', email_verified: true },
    payload: {
      id: 'class_13A1',
      name: '13A1',
      grade: '13'
    },
    expectedResult: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Value Poisoning on User Update',
    collection: 'users',
    docId: 'user_2',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'boconglam@gmail.com', email_verified: true },
    payload: {
      uid: 'user_2',
      email: 'teacher2@gmail.com',
      role: 'gv',
      status: 'super_approved'
    },
    expectedResult: 'PERMISSION_DENIED'
  }
];
