/**
 * 데이터 정규화 (Normalizer)
 * 텍스트 정규화 및 전처리
 */

/**
 * 정규화 옵션
 */
export interface NormalizeOptions {
  /** 공백 정규화 */
  normalizeWhitespace?: boolean;

  /** 특수문자 제거 */
  removeSpecialChars?: boolean;

  /** 소문자 변환 */
  toLowerCase?: boolean;

  /** 숫자 정규화 (전각→반각) */
  normalizeNumbers?: boolean;

  /** 한글 자모 정규화 */
  normalizeKorean?: boolean;

  /** 이모지 제거 */
  removeEmoji?: boolean;

  /** URL 제거 */
  removeUrls?: boolean;

  /** 연속 문자 정규화 (ㅋㅋㅋ → ㅋㅋ) */
  normalizeRepeatedChars?: boolean;
}

/**
 * 기본 정규화 옵션
 */
const DEFAULT_OPTIONS: NormalizeOptions = {
  normalizeWhitespace: true,
  removeSpecialChars: false,
  toLowerCase: false,
  normalizeNumbers: true,
  normalizeKorean: true,
  removeEmoji: false,
  removeUrls: false,
  normalizeRepeatedChars: true,
};

/**
 * 전각 숫자 → 반각 숫자 매핑
 */
const FULLWIDTH_NUMBERS: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
};

/**
 * 전각 문자 → 반각 문자 매핑
 */
const FULLWIDTH_CHARS: Record<string, string> = {
  ...FULLWIDTH_NUMBERS,
  '％': '%',
  '＋': '+',
  '－': '-',
  '．': '.',
  '，': ',',
  '：': ':',
  '；': ';',
  '（': '(',
  '）': ')',
  '［': '[',
  '］': ']',
  '｛': '{',
  '｝': '}',
  '！': '!',
  '？': '?',
  '＆': '&',
  '＝': '=',
  '＠': '@',
  '＃': '#',
  '＄': '$',
  '＊': '*',
  '／': '/',
  '＼': '\\',
  '～': '~',
  '　': ' ',
};

/**
 * URL 패턴
 */
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * 이모지 패턴 (기본 이모지 범위)
 */
const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

/**
 * 데이터 정규화 클래스
 */
export class Normalizer {
  /**
   * 텍스트 정규화
   */
  normalize(text: string, options: NormalizeOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let result = text;

    // 1. URL 제거
    if (opts.removeUrls) {
      result = this.removeUrls(result);
    }

    // 2. 이모지 제거
    if (opts.removeEmoji) {
      result = this.removeEmoji(result);
    }

    // 3. 전각 문자 → 반각 문자
    if (opts.normalizeNumbers) {
      result = this.normalizeFullWidth(result);
    }

    // 4. 한글 정규화 (자모 분리 수정)
    if (opts.normalizeKorean) {
      result = this.normalizeKorean(result);
    }

    // 5. 연속 문자 정규화
    if (opts.normalizeRepeatedChars) {
      result = this.normalizeRepeatedChars(result);
    }

    // 6. 특수문자 제거
    if (opts.removeSpecialChars) {
      result = this.removeSpecialChars(result);
    }

    // 7. 공백 정규화
    if (opts.normalizeWhitespace) {
      result = this.normalizeWhitespace(result);
    }

    // 8. 소문자 변환
    if (opts.toLowerCase) {
      result = result.toLowerCase();
    }

    return result;
  }

  /**
   * 공백 정규화
   * - 연속 공백 → 단일 공백
   * - 줄바꿈 정리
   * - 앞뒤 공백 제거
   */
  normalizeWhitespace(text: string): string {
    return text
      .replace(/[\t\f\v]+/g, ' ')           // 탭 등 → 공백
      .replace(/[ ]+/g, ' ')                 // 연속 공백 → 단일 공백
      .replace(/\r\n/g, '\n')                // CRLF → LF
      .replace(/\r/g, '\n')                  // CR → LF
      .replace(/\n[ ]+/g, '\n')              // 줄 시작 공백 제거
      .replace(/[ ]+\n/g, '\n')              // 줄 끝 공백 제거
      .replace(/\n{3,}/g, '\n\n')            // 3개 이상 줄바꿈 → 2개
      .trim();
  }

  /**
   * 특수문자 제거 (한글, 영문, 숫자, 기본 문장부호 유지)
   */
  removeSpecialChars(text: string): string {
    // 한글, 영문, 숫자, 기본 문장부호, 공백 유지
    return text.replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9\s.,!?%()~\-:;'"]/g, '');
  }

  /**
   * 전각 문자 → 반각 문자 변환
   */
  normalizeFullWidth(text: string): string {
    let result = text;
    for (const [full, half] of Object.entries(FULLWIDTH_CHARS)) {
      result = result.replace(new RegExp(full, 'g'), half);
    }
    return result;
  }

  /**
   * 한글 정규화
   * - 호환 자모 → 표준 자모
   * - 띄어쓰기 오류 수정 (기본적인 것만)
   */
  normalizeKorean(text: string): string {
    let result = text;

    // 호환 자모 정규화 (ㄱ~ㅎ, ㅏ~ㅣ 영역)
    // 의료광고에서 자주 사용되는 강조 표현 정리
    // "완 치" → "완치", "효 과" → "효과" 등
    const spacedWords = [
      ['완 치', '완치'],
      ['효 과', '효과'],
      ['치 료', '치료'],
      ['보 장', '보장'],
      ['안 전', '안전'],
      ['부작 용', '부작용'],
      ['전 문', '전문'],
      ['최 고', '최고'],
      ['최 초', '최초'],
      ['무 료', '무료'],
      ['할 인', '할인'],
      ['이 벤 트', '이벤트'],
    ];

    for (const [spaced, normal] of spacedWords) {
      result = result.replace(new RegExp(spaced, 'g'), normal);
    }

    return result;
  }

  /**
   * 연속 문자 정규화
   * ㅋㅋㅋㅋ → ㅋㅋ, !!! → !!
   */
  normalizeRepeatedChars(text: string): string {
    // 같은 문자 3회 이상 반복 → 2회로 축소
    return text.replace(/(.)\1{2,}/g, '$1$1');
  }

  /**
   * URL 제거
   */
  removeUrls(text: string): string {
    return text.replace(URL_PATTERN, '');
  }

  /**
   * 이모지 제거
   */
  removeEmoji(text: string): string {
    return text.replace(EMOJI_PATTERN, '');
  }

  /**
   * 분석용 텍스트 준비
   * 패턴 매칭에 최적화된 정규화
   */
  prepareForAnalysis(text: string): string {
    return this.normalize(text, {
      normalizeWhitespace: true,
      removeSpecialChars: false,
      toLowerCase: false,
      normalizeNumbers: true,
      normalizeKorean: true,
      removeEmoji: true,
      removeUrls: true,
      normalizeRepeatedChars: true,
    });
  }

  /**
   * 검색용 텍스트 준비
   * 검색/비교에 최적화된 정규화
   */
  prepareForSearch(text: string): string {
    return this.normalize(text, {
      normalizeWhitespace: true,
      removeSpecialChars: true,
      toLowerCase: true,
      normalizeNumbers: true,
      normalizeKorean: true,
      removeEmoji: true,
      removeUrls: true,
      normalizeRepeatedChars: true,
    });
  }
}

/**
 * 기본 정규화기 인스턴스
 */
export const normalizer = new Normalizer();
