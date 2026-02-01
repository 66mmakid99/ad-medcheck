/**
 * 패턴 매칭 엔진
 * patterns.json의 정규식 패턴을 사용하여 텍스트에서 위반 패턴 탐지
 *
 * 오탐 방지 강화:
 * - 맥락 예외 처리 (부정문, 면책조항, 질문문 등)
 * - 문장 내 중복 제거
 * - 신뢰도 기반 필터링 (50% 미만 완전 필터링)
 * 
 * v1.1 수정사항:
 * - minConfidence 기본값 0.5로 변경 (50% 미만 필터링)
 * - 맥락 예외 감지 시 완전 필터링 (continue)
 */

import patternsData from '../../../patterns/patterns.json';

// ============================================
// 맥락 예외 정의 (오탐 방지)
// ============================================

/**
 * 맥락 예외 유형
 */
export type ContextExceptionType =
  | 'NEGATION_BEFORE'   // 앞에 부정어
  | 'NEGATION_AFTER'    // 뒤에 부정어
  | 'DISCLAIMER'        // 면책조항
  | 'QUESTION'          // 질문문
  | 'QUOTATION'         // 인용문
  | 'LEGAL_NOTICE'      // 법적 고지
  | 'NEGATIVE_EXAMPLE'  // 부정적 예시
  | 'CONDITIONAL';      // 조건문

/**
 * 맥락 예외 정의
 */
interface ContextException {
  type: ContextExceptionType;
  patterns: RegExp[];
  description: string;
}

/**
 * 맥락 예외 패턴 목록
 */
const CONTEXT_EXCEPTIONS: ContextException[] = [
  {
    type: 'NEGATION_BEFORE',
    patterns: [
      /(?:절대|결코|전혀|도저히|절대로)\s*.{0,10}$/,
      /(?:~?하지\s*않|~?않|~?아니|~?못)\s*.{0,5}$/,
      /(?:금지|불가|불법|위반)\s*.{0,5}$/,
    ],
    description: '앞에 부정어가 있어 위반 의도가 아님',
  },
  {
    type: 'NEGATION_AFTER',
    patterns: [
      /^.{0,10}(?:하지\s*않습니다|않습니다|아닙니다|없습니다)/,
      /^.{0,10}(?:금지|불가능|불법입니다)/,
      /^.{0,5}(?:은|는)\s*(?:아닙니다|없습니다)/,
    ],
    description: '뒤에 부정어가 있어 위반 의도가 아님',
  },
  {
    type: 'DISCLAIMER',
    patterns: [
      /(?:개인\s*차이|개인차|차이가\s*있|결과가\s*다를)/,
      /(?:부작용|이상반응)\s*(?:이|가)\s*(?:있을|발생|나타날)/,
      /(?:전문의|의사)\s*(?:와|과)\s*(?:상담|상의)/,
      /(?:사전\s*)?(?:상담|검사|진단)\s*(?:이|가)\s*(?:필요|필수)/,
    ],
    description: '면책조항 또는 경고문구',
  },
  {
    type: 'QUESTION',
    patterns: [
      /^.{0,30}(?:\?|인가요|일까요|할까요|할까|인가|일까)$/,
      /(?:어떤|무엇|어떻게|왜|언제)\s*.{0,20}$/,
      /^(?:혹시|과연|정말)\s*/,
    ],
    description: '질문 형태의 문장',
  },
  {
    type: 'QUOTATION',
    patterns: [
      /[""''].*[""'']/,
      /「.*」/,
      /『.*』/,
      /(?:라고|하고)\s*(?:말씀|말|언급|표현)/,
    ],
    description: '다른 출처를 인용하는 문장',
  },
  {
    type: 'LEGAL_NOTICE',
    patterns: [
      /의료법\s*제?\s*\d+조/,
      /(?:법률|법령|규정)\s*(?:에\s*따라|에\s*의해|상)/,
      /(?:식약처|복지부|보건복지부)\s*(?:지침|가이드|규정)/,
      /(?:허가|인가|승인)\s*(?:받은|된|사항)/,
    ],
    description: '법적 고지 또는 규정 안내',
  },
  {
    type: 'NEGATIVE_EXAMPLE',
    patterns: [
      /(?:이런\s*표현|이러한\s*표현)\s*(?:은|는)\s*(?:안|금지|불가)/,
      /(?:위반\s*)?(?:사례|예시|예)(?:입니다|임|:)/,
      /(?:잘못된|불법|부당한)\s*(?:광고|표현|예시)/,
      /(?:하면\s*안|해서는\s*안|하지\s*마)/,
    ],
    description: '잘못된 예시로 제시된 경우',
  },
  {
    type: 'CONDITIONAL',
    patterns: [
      /(?:만약|가령|예를\s*들어|예컨대)\s*/,
      /(?:경우|상황)\s*(?:에는|에서는|라면)/,
      /~?(?:ㄴ다면|한다면|라면|면)\s/,
    ],
    description: '조건문 또는 가정 상황',
  },
];

// ============================================
// 타입 정의
// ============================================

/**
 * 패턴 정의 (patterns.json 구조)
 */
export interface PatternDefinition {
  id: string;
  category: string;
  subcategory: string;
  pattern: string;
  severity: 'critical' | 'major' | 'minor';
  legalBasis: string;
  description: string;
  example: string;
  suggestion: string;
  exceptions?: string[];
}

/**
 * 패턴 매칭 결과
 */
export interface PatternMatch {
  patternId: string;
  category: string;
  subcategory: string;
  matchedText: string;
  position: number;
  endPosition: number;
  context: string;
  severity: 'critical' | 'major' | 'minor';
  confidence: number;
  legalBasis: string;
  description: string;
  suggestion: string;
  /** 맥락 예외 정보 (예외 감지 시) */
  contextException?: {
    type: ContextExceptionType;
    description: string;
    isFiltered: boolean;
  };
  /** 문장 단위 고유 ID */
  sentenceId?: number;
}

/**
 * 매칭 옵션
 */
export interface MatchOptions {
  /** 대소문자 구분 */
  caseSensitive?: boolean;
  /** 특정 카테고리만 검사 */
  categories?: string[];
  /** 특정 심각도 이상만 검사 */
  minSeverity?: 'critical' | 'major' | 'minor';
  /** 컨텍스트 길이 (앞뒤 문자 수) */
  contextLength?: number;
  /** 최대 매칭 수 */
  maxMatches?: number;
  /** 맥락 예외 필터링 활성화 (기본: true) */
  enableContextExceptionFilter?: boolean;
  /** 문장 내 중복 제거 활성화 (기본: true) */
  enableSentenceDedup?: boolean;
  /** 최소 신뢰도 (이하는 필터링, 기본: 0.5) */
  minConfidence?: number;
  /** 맥락 예외 검사 범위 (앞뒤 문자 수) */
  contextExceptionRange?: number;
}

// ============================================
// 패턴 매처 클래스
// ============================================

export class PatternMatcher {
  private patterns: PatternDefinition[];
  private compiledPatterns: Map<string, RegExp>;

  constructor() {
    this.patterns = (patternsData as { patterns: PatternDefinition[] }).patterns || [];
    this.compiledPatterns = new Map();
    this.compilePatterns();
  }

  /**
   * 패턴 정규식 컴파일
   */
  private compilePatterns(): void {
    for (const pattern of this.patterns) {
      try {
        const regex = new RegExp(pattern.pattern, 'gi');
        this.compiledPatterns.set(pattern.id, regex);
      } catch (e) {
        console.warn(`Invalid pattern: ${pattern.id}`, e);
      }
    }
  }

  /**
   * 텍스트에서 패턴 매칭 수행
   */
  match(text: string, options: MatchOptions = {}): PatternMatch[] {
    const {
      caseSensitive = false,
      categories,
      minSeverity,
      contextLength = 50,
      maxMatches = 100,
      enableContextExceptionFilter = true,
      enableSentenceDedup = true,
      // ✅ 수정: 기본값 0.5로 변경 (50% 미만 필터링)
      minConfidence = 0.5,
      contextExceptionRange = 30,
    } = options;

    let matches: PatternMatch[] = [];
    const severityOrder = { critical: 3, major: 2, minor: 1 };
    const minSeverityValue = minSeverity ? severityOrder[minSeverity] : 0;

    // 문장 경계 분석 (중복 제거용)
    const sentenceBoundaries = enableSentenceDedup
      ? this.findSentenceBoundaries(text)
      : [];

    // 검사 대상 패턴 필터링
    let targetPatterns = this.patterns;

    if (categories && categories.length > 0) {
      targetPatterns = targetPatterns.filter(p => categories.includes(p.category));
    }

    if (minSeverity) {
      targetPatterns = targetPatterns.filter(
        p => severityOrder[p.severity] >= minSeverityValue
      );
    }

    // 각 패턴에 대해 매칭 수행
    for (const pattern of targetPatterns) {
      if (matches.length >= maxMatches) break;

      const regex = this.compiledPatterns.get(pattern.id);
      if (!regex) continue;

      // 정규식 재설정 (lastIndex 초기화)
      regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      const searchText = caseSensitive ? text : text;

      while ((match = regex.exec(searchText)) !== null) {
        if (matches.length >= maxMatches) break;

        const matchedText = match[0];
        const position = match.index;
        const endPosition = position + matchedText.length;

        // 예외 패턴 체크 (기존)
        if (pattern.exceptions && pattern.exceptions.length > 0) {
          const isException = this.checkExceptions(
            text,
            position,
            matchedText,
            pattern.exceptions
          );
          if (isException) continue;
        }

        // 컨텍스트 추출
        const context = this.extractContext(text, position, endPosition, contextLength);

        // 신뢰도 계산
        let confidence = this.calculateConfidence(pattern, matchedText, context);

        // ✅ 수정: 맥락 예외 검사 - 감지 시 완전 필터링!
        if (enableContextExceptionFilter) {
          const exceptionCheck = this.checkContextExceptions(
            text,
            position,
            endPosition,
            contextExceptionRange
          );
          if (exceptionCheck) {
            // ✅ 맥락 예외 감지 시 완전히 건너뜀 (continue)
            // 부정문, 면책조항 등이 있으면 위반으로 보지 않음
            continue;
          }
        }

        // 최소 신뢰도 필터링
        if (confidence < minConfidence) continue;

        // 중복 체크 (같은 위치에 여러 패턴 매칭 방지)
        const isDuplicate = matches.some(
          m => m.position === position && m.matchedText === matchedText
        );
        if (isDuplicate) continue;

        // 문장 ID 할당
        const sentenceId = enableSentenceDedup
          ? this.findSentenceId(position, sentenceBoundaries)
          : undefined;

        matches.push({
          patternId: pattern.id,
          category: pattern.category,
          subcategory: pattern.subcategory,
          matchedText,
          position,
          endPosition,
          context,
          severity: pattern.severity,
          confidence,
          legalBasis: pattern.legalBasis,
          description: pattern.description,
          suggestion: pattern.suggestion,
          sentenceId,
        });
      }
    }

    // 문장 내 중복 제거
    if (enableSentenceDedup) {
      matches = this.deduplicateInSentence(matches);
    }

    // 위치 순으로 정렬
    matches.sort((a, b) => a.position - b.position);

    return matches;
  }

  /**
   * 예외 패턴 체크
   */
  private checkExceptions(
    text: string,
    position: number,
    matchedText: string,
    exceptions: string[]
  ): boolean {
    const contextStart = Math.max(0, position - 20);
    const contextEnd = Math.min(text.length, position + matchedText.length + 20);
    const context = text.slice(contextStart, contextEnd);

    for (const exception of exceptions) {
      try {
        const exceptionRegex = new RegExp(exception, 'gi');
        if (exceptionRegex.test(context)) {
          return true;
        }
      } catch {
        // 잘못된 예외 패턴 무시
      }
    }

    return false;
  }

  /**
   * 컨텍스트 추출
   */
  private extractContext(
    text: string,
    start: number,
    end: number,
    length: number
  ): string {
    const contextStart = Math.max(0, start - length);
    const contextEnd = Math.min(text.length, end + length);

    let context = text.slice(contextStart, contextEnd);

    if (contextStart > 0) context = '...' + context;
    if (contextEnd < text.length) context = context + '...';

    return context;
  }

  /**
   * 신뢰도 계산
   * ✅ 개선: 맥락 키워드 기반 가중치 추가
   */
  private calculateConfidence(
    pattern: PatternDefinition,
    matchedText: string,
    context: string
  ): number {
    let confidence = 0.7; // 기본 신뢰도

    // 심각도에 따른 가중치
    if (pattern.severity === 'critical') confidence += 0.15;
    else if (pattern.severity === 'major') confidence += 0.1;

    // 매칭 길이에 따른 가중치 (더 긴 매칭이 더 정확)
    if (matchedText.length > 10) confidence += 0.05;
    if (matchedText.length > 20) confidence += 0.05;

    // ✅ 추가: 위반 강화 키워드 (더 확실한 위반)
    const boostKeywords = ['보장', '확실', '무조건', '반드시', '약속', '보증'];
    for (const keyword of boostKeywords) {
      if (context.includes(keyword)) {
        confidence += 0.05;
        break; // 중복 가산 방지
      }
    }

    // ✅ 추가: 위반 약화 키워드 (위반 가능성 낮음)
    const reduceKeywords = ['수 있습니다', '수도 있', '개인차', '개인에 따라', '노력'];
    for (const keyword of reduceKeywords) {
      if (context.includes(keyword)) {
        confidence -= 0.1;
        break;
      }
    }

    // 최대 0.95, 최소 0.5로 제한
    return Math.max(0.5, Math.min(0.95, confidence));
  }

  /**
   * 맥락 예외 검사 (오탐 방지)
   * 매칭된 텍스트 주변의 맥락을 분석하여 실제 위반이 아닌 경우 필터링
   */
  private checkContextExceptions(
    text: string,
    position: number,
    endPosition: number,
    range: number
  ): ContextException | null {
    // 앞 맥락 추출
    const beforeStart = Math.max(0, position - range);
    const beforeText = text.slice(beforeStart, position);

    // 뒤 맥락 추출
    const afterEnd = Math.min(text.length, endPosition + range);
    const afterText = text.slice(endPosition, afterEnd);

    // 전체 맥락 (문장 단위로 확장)
    const sentenceStart = this.findSentenceStart(text, position);
    const sentenceEnd = this.findSentenceEnd(text, endPosition);
    const fullContext = text.slice(sentenceStart, sentenceEnd);

    for (const exception of CONTEXT_EXCEPTIONS) {
      for (const pattern of exception.patterns) {
        let matched = false;

        switch (exception.type) {
          case 'NEGATION_BEFORE':
            // 앞에 부정어가 있는지 확인
            matched = pattern.test(beforeText);
            break;

          case 'NEGATION_AFTER':
            // 뒤에 부정어가 있는지 확인
            matched = pattern.test(afterText);
            break;

          case 'DISCLAIMER':
          case 'LEGAL_NOTICE':
          case 'NEGATIVE_EXAMPLE':
            // 전체 문장에서 면책/법적 고지/부정적 예시 확인
            matched = pattern.test(fullContext);
            break;

          case 'QUESTION':
            // 문장 전체가 질문인지 확인
            matched = pattern.test(fullContext);
            break;

          case 'QUOTATION':
            // 인용문 내에 있는지 확인
            matched = this.isInsideQuotation(text, position, endPosition);
            break;

          case 'CONDITIONAL':
            // 조건문 앞에 있는지 확인
            matched = pattern.test(beforeText) || pattern.test(fullContext);
            break;
        }

        if (matched) {
          return exception;
        }
      }
    }

    return null;
  }

  /**
   * 인용문 내에 있는지 확인
   */
  private isInsideQuotation(text: string, start: number, end: number): boolean {
    const quotePairs = [
      ['"', '"'],
      ["'", "'"],
      ['"', '"'],
      ['\u2018', '\u2019'],  // ' and '
      ['「', '」'],
      ['『', '』'],
    ];

    for (const [open, close] of quotePairs) {
      // 시작 위치 이전에 열린 따옴표가 있고, 끝 위치 이후에 닫는 따옴표가 있는지 확인
      const textBefore = text.slice(0, start);
      const textAfter = text.slice(end);

      const openCount = (textBefore.match(new RegExp(this.escapeRegex(open), 'g')) || []).length;
      const closeCount = (textBefore.match(new RegExp(this.escapeRegex(close), 'g')) || []).length;

      // 열린 따옴표가 닫힌 따옴표보다 많고, 뒤에 닫는 따옴표가 있으면 인용문 내부
      if (openCount > closeCount && textAfter.includes(close)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 문장 시작 위치 찾기
   */
  private findSentenceStart(text: string, position: number): number {
    const sentenceEnders = /[.!?。！？\n]/;
    for (let i = position - 1; i >= 0; i--) {
      if (sentenceEnders.test(text[i])) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * 문장 끝 위치 찾기
   */
  private findSentenceEnd(text: string, position: number): number {
    const sentenceEnders = /[.!?。！？\n]/;
    for (let i = position; i < text.length; i++) {
      if (sentenceEnders.test(text[i])) {
        return i + 1;
      }
    }
    return text.length;
  }

  /**
   * 문장 경계 찾기
   */
  private findSentenceBoundaries(text: string): number[] {
    const boundaries: number[] = [0];
    const sentenceEnders = /[.!?。！？\n]/g;

    let match: RegExpExecArray | null;
    while ((match = sentenceEnders.exec(text)) !== null) {
      boundaries.push(match.index + 1);
    }

    if (boundaries[boundaries.length - 1] !== text.length) {
      boundaries.push(text.length);
    }

    return boundaries;
  }

  /**
   * 위치가 속한 문장 ID 찾기
   */
  private findSentenceId(position: number, boundaries: number[]): number {
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (position >= boundaries[i] && position < boundaries[i + 1]) {
        return i;
      }
    }
    return boundaries.length - 1;
  }

  /**
   * 문장 내 중복 제거
   * 같은 문장에서 같은 카테고리의 여러 매칭이 있으면 가장 신뢰도 높은 것만 유지
   */
  private deduplicateInSentence(matches: PatternMatch[]): PatternMatch[] {
    if (matches.length === 0) return matches;

    // 문장별로 그룹화
    const bySentence = new Map<number, PatternMatch[]>();
    for (const match of matches) {
      const sentenceId = match.sentenceId ?? 0;
      if (!bySentence.has(sentenceId)) {
        bySentence.set(sentenceId, []);
      }
      bySentence.get(sentenceId)!.push(match);
    }

    const result: PatternMatch[] = [];

    for (const [, sentenceMatches] of bySentence) {
      // 문장 내에서 카테고리별로 그룹화
      const byCategory = new Map<string, PatternMatch[]>();
      for (const match of sentenceMatches) {
        if (!byCategory.has(match.category)) {
          byCategory.set(match.category, []);
        }
        byCategory.get(match.category)!.push(match);
      }

      // 각 카테고리에서 가장 신뢰도 높은 것 선택
      for (const [, categoryMatches] of byCategory) {
        if (categoryMatches.length === 1) {
          result.push(categoryMatches[0]);
        } else {
          // 신뢰도 순으로 정렬하고 가장 높은 것 선택
          categoryMatches.sort((a, b) => b.confidence - a.confidence);
          result.push(categoryMatches[0]);
        }
      }
    }

    return result;
  }

  /**
   * 특정 패턴으로 매칭
   */
  matchWithPattern(text: string, patternId: string): PatternMatch[] {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (!pattern) return [];

    return this.match(text, { categories: [pattern.category] }).filter(
      m => m.patternId === patternId
    );
  }

  /**
   * 카테고리별 매칭
   */
  matchByCategory(text: string, category: string): PatternMatch[] {
    return this.match(text, { categories: [category] });
  }

  /**
   * 패턴 목록 조회
   */
  getPatterns(): PatternDefinition[] {
    return this.patterns;
  }

  /**
   * 카테고리 목록 조회
   */
  getCategories(): string[] {
    return [...new Set(this.patterns.map(p => p.category))];
  }

  /**
   * 패턴 수 조회
   */
  getPatternCount(): number {
    return this.patterns.length;
  }
}

// 싱글톤 인스턴스
export const patternMatcher = new PatternMatcher();
