import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { StudentProfile, HealthStatus } from '../types';
import { calculateBmiValue } from '../data/students';

interface ImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (students: StudentProfile[], replaceAll: boolean) => void;
  currentCount: number;
}

export const ImportStudentsModal: React.FC<ImportStudentsModalProps> = ({
  isOpen,
  onClose,
  onImport,
  currentCount
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState<string>('');
  const [replaceAll, setReplaceAll] = useState<boolean>(false);
  const [parsedPreview, setParsedPreview] = useState<StudentProfile[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  if (!isOpen) return null;

  const sampleExcelData = `Mã HS\tHọ và tên\tLớp\tGiới tính\tChiều cao\tCân nặng\tGhi chú sức khỏe\tSĐT Phụ huynh
20261001\tNguyễn Minh Triết\t10A1\tNam\t170\t62\tThể lực tốt, nhanh nhẹn\t0918111222
20261002\tTrần Mỹ Duyên\t10A1\tNữ\t158\t44\tThể lực hơi yếu, nhanh mệt\t0918333444
20261003\tHuỳnh Quốc Bảo\t10A3\tNam\t172\t78\tThừa cân độ 1, đau gối khi nhảy tiếp đất\t0918555666
20261201\tLê Phương Thảo\t12C1\tNữ\t162\t51\tTiền sử hen suyễn khi trời lạnh\t0918777888
20261202\tPhạm Hoàng Phúc\t12C2\tNam\t167\t58\tThể trạng chuẩn, kỹ thuật tốt\t0918999000
20261203\tVõ Thành Đạt\t12C3\tNam\t174\t82\tThừa cân, cần giảm tải bài tập gối\t0977123456`;

  const buildStudentFromRow = (parts: string[], idx: number): StudentProfile | null => {
    const cleanParts = parts.map(p => String(p ?? '').trim());
    if (cleanParts.every(p => !p)) return null;

    const firstColLower = cleanParts[0]?.toLowerCase() || '';
    const secondColLower = cleanParts[1]?.toLowerCase() || '';
    if (
      firstColLower.includes('mã') ||
      firstColLower === 'stt' ||
      firstColLower.includes('code') ||
      secondColLower.includes('họ và tên') ||
      secondColLower.includes('họ tên')
    ) {
      return null;
    }

    let code = cleanParts[0] || `HS-${Date.now().toString().slice(-4)}-${idx}`;
    let name = cleanParts[1] || '';
    let className = cleanParts[2] || '10A1';
    let genderStr = cleanParts[3] || 'Nam';
    let gender: 'Nam' | 'Nữ' = genderStr.toLowerCase().includes('nữ') || genderStr.toLowerCase().includes('nu') ? 'Nữ' : 'Nam';

    let height = parseFloat(cleanParts[4]) || 165;
    let weight = parseFloat(cleanParts[5]) || 58;
    let medicalNote = cleanParts[6] || 'Thể trạng bình thường';
    let parentPhone = cleanParts[7] || '';

    if (!name && cleanParts[0]) {
      name = cleanParts[0];
      code = `HS-${idx + 1}`;
    }

    if (!name) return null;

    const bmi = calculateBmiValue(height, weight);
    let status: HealthStatus = 'standard';
    if (medicalNote.toLowerCase().includes('hen') || medicalNote.toLowerCase().includes('tim')) {
      status = 'mild';
    } else if (bmi >= 24) {
      status = 'overweight';
    } else if (bmi < 18.5) {
      status = 'underweight';
    }

    return {
      id: `st-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      code: code.slice(0, 50),
      name: name.slice(0, 100),
      class: className.slice(0, 20),
      gender,
      heightCm: height,
      weightKg: weight,
      bmi,
      status,
      medicalNote: medicalNote.slice(0, 500),
      parentPhone: parentPhone.slice(0, 30),
      evalTech: 'Thực hiện đúng kỹ thuật cơ bản',
      evalAttitude: 'Tự giác, tích cực tập luyện',
      evalDigital: 'Chủ động dùng camera phân tích động tác',
      rating: 'Đạt'
    };
  };

  const handleParseText = (text: string) => {
    setPastedText(text);
    setParseError(null);

    if (!text.trim()) {
      setParsedPreview([]);
      return;
    }

    const lines = text.trim().split(/\r?\n/);
    const parsed: StudentProfile[] = [];

    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      let parts: string[] = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else if (line.includes(',')) {
        parts = line.split(',');
      } else {
        parts = line.trim().split(/\s{2,}/);
      }

      const st = buildStudentFromRow(parts, idx);
      if (st) parsed.push(st);
    });

    if (parsed.length === 0) {
      setParseError('Không nhận diện được dòng dữ liệu hợp lệ. Vui lòng kiểm tra định dạng bảng tính!');
    } else {
      setParsedPreview(parsed);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

        const parsed: StudentProfile[] = [];
        rows.forEach((row, idx) => {
          if (Array.isArray(row)) {
            const st = buildStudentFromRow(row.map(c => String(c ?? '')), idx);
            if (st) parsed.push(st);
          }
        });

        if (parsed.length === 0) {
          setParseError('Tệp Excel không có dữ liệu học sinh hợp lệ. Vui lòng tải file mẫu để xem cấu trúc cột!');
        } else {
          setParsedPreview(parsed);
        }
      } catch (err) {
        console.error('Excel parse error:', err);
        setParseError('Không thể đọc tệp Excel. Vui lòng chọn tệp .xlsx, .xls hoặc .csv hợp lệ!');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleDownloadSampleExcel = () => {
    const rows = [
      ['Mã HS', 'Họ và tên', 'Lớp', 'Giới tính', 'Chiều cao (cm)', 'Cân nặng (kg)', 'Ghi chú sức khỏe', 'SĐT Phụ huynh'],
      ['20261001', 'Nguyễn Minh Triết', '10A1', 'Nam', 170, 62, 'Thể lực tốt nhanh nhẹn', '0918111222'],
      ['20261002', 'Trần Mỹ Duyên', '10A1', 'Nữ', 158, 44, 'Thể lực hơi yếu', '0918333444'],
      ['20261003', 'Huỳnh Quốc Bảo', '10A3', 'Nam', 172, 78, 'Thừa cân độ 1 mỏi gối', '0918555666'],
      ['20261201', 'Lê Phương Thảo', '12C1', 'Nữ', 162, 51, 'Tiền sử hen suyễn khi trời lạnh', '0918777888'],
      ['20261202', 'Phạm Hoàng Phúc', '12C2', 'Nam', 167, 58, 'Thể trạng chuẩn', '0918999000']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Hoc_Sinh');
    XLSX.writeFile(wb, 'Mau_Danh_Sach_Hoc_Sinh_THPT_HuynhTanPhat.xlsx');
  };

  const handleApplyImport = () => {
    if (parsedPreview.length === 0) return;
    onImport(parsedPreview, replaceAll);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto border border-slate-200">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-lg font-black">
              <i className="fa-solid fa-file-excel"></i>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base md:text-lg">
                Nhập Danh Sách Học Sinh Từ Excel (.xlsx / .xls / .csv)
              </h3>
              <p className="text-xs text-slate-500">
                Hỗ trợ tải trực tiếp tệp Excel (.xlsx, .xls, .csv) hoặc sao chép & dán từ bảng tính Excel, vnEdu, SMAS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab chuyển đổi */}
        <div className="flex border-b border-slate-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab('file')}
            className={`py-2 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'file'
                ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fa-solid fa-file-excel"></i>
            <span>Tải Tệp Excel (.xlsx / .xls / .csv)</span>
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`py-2 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'paste'
                ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className="fa-solid fa-paste"></i>
            <span>Sao Chép & Dán Nhanh Từ Excel</span>
          </button>
        </div>

        {/* Tab 1: Upload File Excel */}
        {activeTab === 'file' && (
          <div className="space-y-3 text-xs">
            <div className="border-2 border-dashed border-emerald-400 rounded-xl p-6 text-center space-y-2.5 bg-emerald-50/40">
              <i className="fa-solid fa-file-excel text-3xl text-emerald-600"></i>
              <p className="font-bold text-slate-800 text-sm">
                Chọn tệp Excel (.xlsx, .xls) hoặc .csv từ máy tính
              </p>
              <p className="text-slate-500">
                Cấu trúc cột: <strong>Mã HS | Họ và tên | Lớp | Giới tính | Chiều cao (cm) | Cân nặng (kg) | Ghi chú sức khỏe | SĐT Phụ huynh</strong>
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={handleFileUpload}
                className="block mx-auto text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
              />
              {uploadedFileName && (
                <p className="text-emerald-700 font-semibold pt-1">
                  Đã tải tệp: {uploadedFileName}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-600">Chưa có file mẫu chuẩn? Tải ngay tệp Excel mẫu hoặc dùng dữ liệu mẫu:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleParseText(sampleExcelData)}
                  className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-2.5 py-1.5 rounded transition cursor-pointer"
                >
                  Nạp dữ liệu mẫu thử
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSampleExcel}
                  className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1"
                >
                  <i className="fa-solid fa-download"></i>
                  <span>Tải File Excel Mẫu (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Paste từ Excel */}
        {activeTab === 'paste' && (
          <div className="space-y-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-600 space-y-1 leading-relaxed">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-info text-emerald-600"></i> Hướng dẫn dán nhanh từ Excel:
              </p>
              <p>
                1. Mở file Excel danh sách lớp (vnEdu / SMAS).<br />
                2. Bôi đen các cột: <strong>Mã HS | Họ và tên | Lớp | Giới tính | Chiều cao | Cân nặng | Ghi chú sức khỏe | SĐT Phụ huynh</strong>.<br />
                3. Bấm <strong>Ctrl + C</strong> và dán (<strong>Ctrl + V</strong>) vào ô bên dưới.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleParseText(sampleExcelData)}
                  className="text-xs bg-emerald-700 text-white font-semibold px-2.5 py-1 rounded hover:bg-emerald-800 transition cursor-pointer"
                >
                  <i className="fa-solid fa-magic mr-1"></i> Dán Dữ Liệu Mẫu Để Xem Thử
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSampleExcel}
                  className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-2.5 py-1 rounded transition cursor-pointer"
                >
                  <i className="fa-solid fa-download mr-1"></i> Tải File Mẫu (.xlsx)
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Dán dữ liệu từ bảng tính vào đây:
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => handleParseText(e.target.value)}
                rows={5}
                placeholder="Dán các dòng từ Excel vào đây (mỗi dòng một học sinh)..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 font-mono text-xs text-slate-800 focus:outline-emerald-600"
              />
            </div>
          </div>
        )}

        {/* Lỗi phân tích nếu có */}
        {parseError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
            <span>{parseError}</span>
          </div>
        )}

        {/* Khung xem trước dữ liệu được nhận diện */}
        {parsedPreview.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                Xem trước danh sách ({parsedPreview.length} học sinh sẵn sàng nhập):
              </span>
              <span className="text-slate-500 italic">
                BMI và phân nhóm thể trạng được tính toán tự động
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Mã HS</th>
                    <th className="p-2">Họ và Tên</th>
                    <th className="p-2">Lớp</th>
                    <th className="p-2">Giới tính</th>
                    <th className="p-2">Cao / Nặng</th>
                    <th className="p-2">BMI & Thể trạng</th>
                    <th className="p-2">Ghi chú sức khỏe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedPreview.map((st, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-medium text-slate-600">{st.code}</td>
                      <td className="p-2 font-bold text-slate-800">{st.name}</td>
                      <td className="p-2 font-semibold text-emerald-800">{st.class}</td>
                      <td className="p-2">{st.gender}</td>
                      <td className="p-2">{st.heightCm}cm / {st.weightKg}kg</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          st.status === 'overweight' ? 'bg-amber-100 text-amber-800' :
                          st.status === 'underweight' ? 'bg-blue-100 text-blue-800' :
                          st.status === 'mild' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {st.bmi} ({st.status === 'overweight' ? 'Thừa cân' : st.status === 'underweight' ? 'Thiếu cân' : st.status === 'mild' ? 'Bệnh nền' : 'Chuẩn'})
                        </span>
                      </td>
                      <td className="p-2 text-slate-600 truncate max-w-xs">{st.medicalNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tùy chọn thay thế hay thêm vào */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="replaceCheck"
              checked={replaceAll}
              onChange={(e) => setReplaceAll(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 cursor-pointer"
            />
            <label htmlFor="replaceCheck" className="text-slate-800 font-medium cursor-pointer">
              Xóa dữ liệu cũ và <strong>thay thế toàn bộ</strong> bằng danh sách mới này
            </label>
          </div>
          <span className="text-slate-500">
            Hiện tại trong hệ thống có: <strong>{currentCount}</strong> học sinh
          </span>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer text-xs md:text-sm"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleApplyImport}
            disabled={parsedPreview.length === 0}
            className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold transition cursor-pointer text-xs md:text-sm shadow-xs flex items-center gap-1.5"
          >
            <i className="fa-solid fa-check"></i>
            <span>Nhập {parsedPreview.length > 0 ? `${parsedPreview.length} Học Sinh` : ''} Vào Hệ Thống</span>
          </button>
        </div>

      </div>
    </div>
  );
};
