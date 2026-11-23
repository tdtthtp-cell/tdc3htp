/**
 * Bộ kiểm tra và lọc hình ảnh minh họa theo nội dung bài dạy
 * Trường THPT Huỳnh Tấn Phát (Bến Tre)
 */
import { LessonDiagramImage, SportKey } from '../types';

export interface DiagramMatchResult {
  matches: boolean;
  reason?: string;
  techniqueTag?: string;
}

/**
 * Kiểm tra xem một hình ảnh minh họa có phù hợp với tên bài dạy hay không
 */
export function checkDiagramMatchesLesson(
  diagram: LessonDiagramImage,
  lessonTitle: string,
  sportKey: SportKey
): DiagramMatchResult {
  const normTitle = (lessonTitle || '').toLowerCase();

  // 1. Nếu là ảnh AI tạo riêng cho bài dạy này
  if (diagram.type === 'ai-generated' || diagram.imageUrl) {
    if (diagram.promptUsed) {
      const normPrompt = diagram.promptUsed.toLowerCase();
      // Nếu prompt có chứa tên môn thể thao khác hoàn toàn
      if (sportKey === 'bong-ro' && (normPrompt.includes('bóng chuyền') || normPrompt.includes('cầu lông'))) {
        return {
          matches: false,
          reason: 'Hình ảnh thuộc môn khác, không đúng với bài dạy Bóng rổ',
          techniqueTag: 'Sai môn thể thao'
        };
      }
      if (sportKey === 'bong-chuyen' && (normPrompt.includes('bóng rổ') || normPrompt.includes('cầu lông'))) {
        return {
          matches: false,
          reason: 'Hình ảnh thuộc môn khác, không đúng với bài dạy Bóng chuyền',
          techniqueTag: 'Sai môn thể thao'
        };
      }
      if (sportKey === 'cau-long' && (normPrompt.includes('bóng rổ') || normPrompt.includes('bóng chuyền'))) {
        return {
          matches: false,
          reason: 'Hình ảnh thuộc môn khác, không đúng với bài dạy Cầu lông',
          techniqueTag: 'Sai môn thể thao'
        };
      }
    }
    return { matches: true, techniqueTag: 'Hình ảnh AI theo bài dạy' };
  }

  // 2. Sơ đồ tổ chức đội hình chung trên sân bãi (court-formation)
  if (diagram.svgType === 'court-formation') {
    return { matches: true, techniqueTag: 'Sơ đồ tổ chức lớp học' };
  }

  // 3. BÓNG RỔ: Nhảy ném rổ 1 tay trên vai (basketball-shoot)
  if (diagram.svgType === 'basketball-shoot') {
    const isShootingLesson =
      normTitle.includes('ném') ||
      normTitle.includes('bắn rổ') ||
      normTitle.includes('lên rổ') ||
      normTitle.includes('shoot') ||
      normTitle.includes('vào rổ');

    if (!isShootingLesson) {
      return {
        matches: false,
        reason: 'Hình ảnh mô tả kỹ thuật Ném rổ vào vành rổ 3.05m (không đúng với bài dạy không có nội dung ném rổ)',
        techniqueTag: 'Kỹ thuật ném rổ (Mismatched)'
      };
    }
    return { matches: true, techniqueTag: 'Kỹ thuật ném rổ chuẩn xác' };
  }

  // 4. BÓNG CHUYỀN: Phát bóng thấp tay (volleyball-serve-low)
  if (diagram.svgType === 'volleyball-serve-low') {
    const isServeLesson =
      normTitle.includes('phát bóng thấp') ||
      normTitle.includes('giao bóng thấp') ||
      (normTitle.includes('phát bóng') && !normTitle.includes('cao tay'));

    if (!isServeLesson) {
      return {
        matches: false,
        reason: 'Hình ảnh mô tả kỹ thuật Phát bóng thấp tay (không đúng với bài dạy chuyền/đệm/chắn/đập bóng)',
        techniqueTag: 'Phát bóng thấp tay (Mismatched)'
      };
    }
    return { matches: true, techniqueTag: 'Kỹ thuật phát bóng thấp tay' };
  }

  // 5. BÓNG CHUYỀN: Chuyền bóng cao tay bằng 2 tay (volleyball-pass-high)
  if (diagram.svgType === 'volleyball-pass-high') {
    const isPassHighLesson =
      normTitle.includes('cao tay') ||
      normTitle.includes('chuyền hai') ||
      normTitle.includes('chuyền bóng cao') ||
      normTitle.includes('bắt bóng trên đầu');

    if (!isPassHighLesson) {
      return {
        matches: false,
        reason: 'Hình ảnh mô tả kỹ thuật Chuyền bóng cao tay (không đúng với bài dạy đệm bóng/phát bóng/chắn bóng)',
        techniqueTag: 'Chuyền bóng cao tay (Mismatched)'
      };
    }
    return { matches: true, techniqueTag: 'Kỹ thuật chuyền bóng cao tay' };
  }

  // 6. CẦU LÔNG: Di chuyển 4 góc sân & Đập cầu Smash (badminton-court)
  if (diagram.svgType === 'badminton-court') {
    const isCourtOrSmashLesson =
      normTitle.includes('di chuyển') ||
      normTitle.includes('bộ bước') ||
      normTitle.includes('bước chân') ||
      normTitle.includes('đập cầu') ||
      normTitle.includes('smash') ||
      normTitle.includes('4 góc') ||
      normTitle.includes('sân');

    const isNonCourtLesson =
      normTitle.includes('cầm vợt') ||
      normTitle.includes('tâng cầu') ||
      normTitle.includes('giao cầu ngắn') ||
      normTitle.includes('lý thuyết') ||
      normTitle.includes('dinh dưỡng');

    if (!isCourtOrSmashLesson && isNonCourtLesson) {
      return {
        matches: false,
        reason: 'Sơ đồ di chuyển 4 góc sân & đập cầu không đúng với nội dung bài học nhập môn này',
        techniqueTag: 'Sân 4 góc & Smash (Mismatched)'
      };
    }
    return { matches: true, techniqueTag: 'Sơ đồ di chuyển sân cầu lông' };
  }

  return { matches: true, techniqueTag: 'Sơ đồ sư phạm' };
}

/**
 * Lọc và tách riêng các hình ảnh đúng nội dung và các hình ảnh không đúng
 */
export function filterDiagramsMatchingLesson(
  diagrams: LessonDiagramImage[],
  lessonTitle: string,
  sportKey: SportKey
): { matching: LessonDiagramImage[]; mismatched: LessonDiagramImage[] } {
  const matching: LessonDiagramImage[] = [];
  const mismatched: LessonDiagramImage[] = [];

  for (const diag of diagrams) {
    const check = checkDiagramMatchesLesson(diag, lessonTitle, sportKey);
    if (check.matches) {
      matching.push(diag);
    } else {
      mismatched.push(diag);
    }
  }

  return { matching, mismatched };
}
