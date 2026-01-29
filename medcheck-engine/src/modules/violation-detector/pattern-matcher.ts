/**
 * 패턴 매칭 엔진
 * patterns.json의 정규식 패턴을 사용하여 텍스트에서 위반 패턴 탐지
 */

import patternsData from '../../../patterns/patterns.json';

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
    } = options;

    const matches: PatternMatch[] = [];
    const severityOrder = { critical: 3, major: 2, minor: 1 };
    const minSeverityValue = minSeverity ? severityOrder[minSeverity] : 0;

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

        // 예외 패턴 체크
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
        const confidence = this.calculateConfidence(pattern, matchedText, context);

        // 중복 체크 (같은 위치에 여러 패턴 매칭 방지)
        const isDuplicate = matches.some(
          m => m.position === position && m.matchedText === matchedText
        );
        if (isDuplicate) continue;

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
        });
      }
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

    // 최대 0.95로 제한
    return Math.min(0.95, confidence);
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
