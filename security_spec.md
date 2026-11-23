# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Super Admin Authority**: Only verified Google accounts `boconglam@gmail.com` and `tdtt.htp@gmail.com` (`request.auth.token.email_verified == true`) or users with an approved admin profile in `/users/{uid}` (`role == 'admin' && status == 'approved'`) possess full system administrative privileges (`isAdmin()`).
2. **Self-Registration Prevention of Privilege Escalation**: When a standard user signs in via Google for the first time and creates `/users/{uid}`, they can ONLY create their own profile (`uid == request.auth.uid`) with `status == 'pending'` and `role == 'gv'` (or `'hs'`), and all management flags (`canManageUsers`, etc.) set to `false` unless they are a bootstrapped Super Admin (`boconglam@gmail.com` or `tdtt.htp@gmail.com`).
3. **Approved Data Managers**: Modifying `/students/{studentId}`, `/classes/{classId}`, or `/teachers/{teacherId}` requires either `isAdmin()` or an approved user account (`/users/$(request.auth.uid).data.status == 'approved'`).
4. **Immutable Audit Logs**: Entries in `/audit_logs/{logId}` are append-only (`create` by authenticated users or admins, `delete` only by `isAdmin()`, `update` strictly forbidden).
5. **Path & Payload Hygiene**: All document IDs must match `^[a-zA-Z0-9_\-]+$` with length <= 128 (`isValidId()`), and every string field enforces strict `.size()` bounds from `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Payloads
1. **Unverified Admin Email Spoof**: `{ auth: { uid: 'u1', token: { email: 'boconglam@gmail.com', email_verified: false } } }` attempting to approve a user.
2. **Self-Assigned Admin Role on Registration**: User `u2` (`teacher2@gmail.com`) creating `/users/u2` with `{ role: 'admin', status: 'approved', canManageUsers: true }`.
3. **Cross-User Profile Hijack**: User `u2` creating or updating `/users/u3` where `u2 != u3` and `u2` is not an admin.
4. **Shadow Field Injection on Student**: Creating `/students/st1` with an undeclared field `{ ghostAdmin: true }`.
5. **Oversized String DoW Attack on Student**: Creating `/students/st1` with `name` of 5,000 characters (`maxLength: 100`).
6. **Invalid ID Poisoning**: Creating `/students/bad$id!with/slashes` or ID > 128 chars.
7. **Unapproved User Modifying Student Roster**: User `u2` with `status: 'pending'` attempting `update` or `delete` on `/students/st1`.
8. **Unapproved User Bulk Deleting Classes**: User `u2` with `status: 'pending'` attempting `delete` on `/classes/c1`.
9. **Unapproved User Modifying Teachers List**: User `u2` with `status: 'rejected'` attempting `create` on `/teachers/t1`.
10. **Audit Log Tampering**: Any user attempting to `update` an existing `/audit_logs/log1` document to erase their tracks.
11. **Invalid Enum Value on ClassRoom**: Creating `/classes/c1` with `grade: '13'` (outside `['10', '11', '12']`).
12. **Value Poisoning on User Update**: Updating `/users/u2` with `status: 'super_approved'` or non-boolean `canManageStudents: 'yes'`.
