/**
 * 맥락 기반 분석기
 * 규칙만으로 애매한 케이스를 AI가 판정
 */

import { LLMClient, createLLMClient, AIAnalysisResult, LLMProvider } from './llm-client';
import type { PatternMatch } from '../violation-detector/pattern-matcher';
import type { ViolationResult } from '../../types';

// ============================================
// 타입 정의
// ============================================

/**
 * 맥락 분석 설정
 */
export interface ContextAnalyzerConfig {
  /** LLM 제공자 */
  provider: LLMProvider;
  /** API 키 */
  apiKey: string;
  /** 모델 */
  model?: string;
  /** 신뢰도 임계값 (이 이하면 AI 분석) */
  confidenceThreshold?: number;
  /** 최대 AI 분석 수 */
  maxAIAnalysis?: number;
}

/**
 * 애매한 표현 패턴
 */
interface AmbiguousPattern {
  pattern: RegExp;
  category: string;
  description: string;
  examples: string[];
}

/**
 * AI 분석 대상
 */
interface AIAnalysisTarget {
  text: string;
  context: string;
  patternMatch?: PatternMatch;
  reason: string;
}

/**
 * 맥락 분석 결과
 */
export interface ContextAnalysisResult {
  /** 원본 패턴 매칭 결과 */
  patternMatches: PatternMatch[];
  /** AI 분석된 항목 */
  aiAnalyzedItems: Array<{
    target: AIAnalysisTarget;
    result: AIAnalysisResult;
  }>;
  /** AI가 추가로 발견한 위반 */
  additionalViolations: ViolationResult[];
  /** 전체 AI 분석 시간 (ms) */
  aiProcessingTimeMs: number;
  /** AI 호출 횟수 */
  aiCallCount: number;
}

// ============================================
// 애매한 표현 패턴들
// ============================================

const AMBIGUOUS_PATTERNS: AmbiguousPattern[] = [
  {
    pattern: /많은\s*(분들?이?|환자들?이?|고객들?이?)\s*(효과|만족|개선)/gi,
    category: '암시적 효과 보장',
    description: '통계적 근거 없이 다수의 효과를 암시',
    examples: ['많은 분들이 효과를 보셨습니다', '많은 환자들이 만족하셨습니다'],
  },
  {
    pattern: /자연스러운?\s*(결과|효과|변화|모습)/gi,
    category: '애매한 효과 표현',
    description: '자연스러움을 강조하는 표현 (맥락에 따라 다름)',
    examples: ['자연스러운 결과를 약속합니다', '자연스러운 변화'],
  },
  {
    pattern: /(대부분|거의\s*모든?)\s*(환자|분들?|고객)/gi,
    category: '과장된 통계 표현',
    description: '구체적 수치 없이 대부분을 언급',
    examples: ['대부분의 환자들이', '거의 모든 분들이'],
  },
  {
    pattern: /(놀라운?|놀랍게?|신기하게?|기적적으?로?)\s*(효과|결과|변화)/gi,
    category: '과장 표현',
    description: '과장된 감탄 표현',
    examples: ['놀라운 효과', '기적적인 변화'],
  },
  {
    pattern: /(안전한?|안심하?\s*(하세요|됩니다)|걱정\s*(없|마세요))/gi,
    category: '안전성 과장',
    description: '안전성을 무조건적으로 강조',
    examples: ['완전히 안전합니다', '부작용 걱정 마세요'],
  },
  {
    pattern: /(빠른|신속한?|즉각적인?)\s*(효과|회복|개선|결과)/gi,
    category: '속도 과장',
    description: '빠른 효과를 강조',
    examples: ['빠른 효과를 경험하세요', '즉각적인 개선'],
  },
  {
    pattern: /(오랜|풍부한?|수많은?)\s*(경험|노하우|실력)/gi,
    category: '경험 강조',
    description: '경험을 과장 (맥락에 따라 다름)',
    examples: ['오랜 경험의 의료진', '수많은 시술 경험'],
  },
  {
    pattern: /(특별한?|차별화된?|남다른?)\s*(기술|방법|비법|노하우)/gi,
    category: '차별화 강조',
    description: '특별함 강조 (비교광고 가능성)',
    examples: ['특별한 기술로', '차별화된 방법'],
  },
  {
    pattern: /(전문|최신|첨단)\s*(장비|시설|기술)/gi,
    category: '시설 강조',
    description: '시설/장비 강조 (맥락에 따라 다름)',
    examples: ['최신 장비 보유', '첨단 기술 적용'],
  },
  {
    pattern: /(평생|영구적?|반영구적?)\s*(효과|유지|보장)/gi,
    category: '지속성 과장',
    description: '효과의 영구성 강조',
    examples: ['평생 유지됩니다', '반영구적 효과'],
  },
];

// ============================================
// 맥락 분석기 클래스
// ============================================

export class ContextAnalyzer {
  private client: LLMClient | null = null;
  private config: ContextAnalyzerConfig | null = null;

  /**
   * LLM 클라이언트 설정
   */
  configure(config: ContextAnalyzerConfig): void {
    this.config = {
      confidenceThreshold: 0.7,
      maxAIAnalysis: 5,
      ...config,
    };

    this.client = createLLMClient(config.provider, config.apiKey, {
      model: config.model,
    });
  }

  /**
   * LLM 클라이언트가 설정되었는지 확인
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * 텍스트에서 애매한 표현 찾기
   */
  findAmbiguousExpressions(text: string): AIAnalysisTarget[] {
    const targets: AIAnalysisTarget[] = [];

    for (const pattern of AMBIGUOUS_PATTERNS) {
      pattern.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.pattern.exec(text)) !== null) {
        const matchedText = match[0];
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + matchedText.length + 50);
        const context = text.slice(start, end);

        // 중복 체크
        const isDuplicate = targets.some(
          t => t.text === matchedText && Math.abs(t.context.indexOf(matchedText) - context.indexOf(matchedText)) < 10
        );

        if (!isDuplicate) {
          targets.push({
            text: matchedText,
            context,
            reason: `${pattern.category}: ${pattern.description}`,
          });
        }
      }
    }

    return targets;
  }

  /**
   * 패턴 매칭 결과 중 AI 분석이 필요한 항목 필터링
   */
  filterForAIAnalysis(matches: PatternMatch[]): AIAnalysisTarget[] {
    const threshold = this.config?.confidenceThreshold || 0.7;

    return matches
      .filter(m => m.confidence < threshold)
      .map(m => ({
        text: m.matchedText,
        context: m.context,
        patternMatch: m,
        reason: `낮은 신뢰도 (${(m.confidence * 100).toFixed(0)}%)`,
      }));
  }

  /**
   * 맥락 기반 AI 분석 수행
   */
  async analyze(
    text: string,
    patternMatches: PatternMatch[]
  ): Promise<ContextAnalysisResult> {
    const startTime = Date.now();

    if (!this.client || !this.config) {
      // AI 클라이언트가 설정되지 않은 경우
      return {
        patternMatches,
        aiAnalyzedItems: [],
        additionalViolations: [],
        aiProcessingTimeMs: 0,
        aiCallCount: 0,
      };
    }

    const maxAnalysis = this.config.maxAIAnalysis || 5;

    // AI 분석 대상 수집
    const lowConfidenceTargets = this.filterForAIAnalysis(patternMatches);
    const ambiguousTargets = this.findAmbiguousExpressions(text);

    // 중복 제거 및 제한
    const allTargets = [...lowConfidenceTargets, ...ambiguousTargets].slice(0, maxAnalysis);

    const aiAnalyzedItems: ContextAnalysisResult['aiAnalyzedItems'] = [];
    const additionalViolations: ViolationResult[] = [];

    // AI 분석 수행
    for (const target of allTargets) {
      try {
        const result = await this.client.analyzeAdText(target.text, target.context);

        aiAnalyzedItems.push({ target, result });

        // AI가 위반으로 판단한 경우 추가
        if (result.isViolation && result.confidence >= 0.7) {
          // 기존 패턴 매칭과 중복이 아닌 경우만 추가
          const isNewViolation = !patternMatches.some(
            m => m.matchedText === target.text
          );

          if (isNewViolation) {
            additionalViolations.push({
              type: this.mapViolationType(result.violationType),
              status: result.confidence >= 0.85 ? 'violation' : 'likely',
              severity: result.confidence >= 0.9 ? 'high' : 'medium',
              matchedText: target.text,
              description: result.reasoning,
              legalBasis: result.legalReference
                ? [
                    {
                      law: '의료법',
                      article: result.legalReference,
                      description: result.reasoning,
                    },
                  ]
                : [],
              confidence: result.confidence,
            });
          }
        }
      } catch (error) {
        // AI 분석 실패는 무시하고 계속 진행
        console.warn('AI analysis failed:', error);
      }
    }

    return {
      patternMatches,
      aiAnalyzedItems,
      additionalViolations,
      aiProcessingTimeMs: Date.now() - startTime,
      aiCallCount: aiAnalyzedItems.length,
    };
  }

  /**
   * 위반 유형 매핑
   */
  private mapViolationType(type?: string): ViolationResult['type'] {
    if (!type) return 'other';

    const typeMap: Record<string, ViolationResult['type']> = {
      '치료효과 보장': 'guarantee',
      '효과 보장': 'guarantee',
      '암시적 효과 보장': 'guarantee',
      '부작용 부정': 'false_claim',
      '부작용 축소': 'false_claim',
      '허위 광고': 'false_claim',
      '최상급 표현': 'exaggeration',
      '과장 표현': 'exaggeration',
      '과장': 'exaggeration',
      '비교 광고': 'comparison',
      '비교광고': 'comparison',
      '환자 유인': 'price_inducement',
      '가격 유인': 'price_inducement',
      '전후 사진': 'before_after',
      '전후사진': 'before_after',
      '체험기': 'testimonial',
      '후기': 'testimonial',
    };

    for (const [key, value] of Object.entries(typeMap)) {
      if (type.includes(key)) return value;
    }

    return 'other';
  }
}

// 싱글톤 인스턴스
export const contextAnalyzer = new ContextAnalyzer();
