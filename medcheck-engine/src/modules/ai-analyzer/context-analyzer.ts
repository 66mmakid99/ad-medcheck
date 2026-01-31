/**
 * 맥락 기반 분석기
 * 규칙만으로 애매한 케이스를 AI가 판정
 *
 * 맥락 분석 강화:
 * - 광고 의도 분석
 * - 대상 청중 분석
 * - 문맥 유효성 검증
 * - 문서 유형 감지
 */

import { LLMClient, createLLMClient, AIAnalysisResult, LLMProvider } from './llm-client';
import type { PatternMatch } from '../violation-detector/pattern-matcher';
import type { ViolationResult } from '../../types';

// ============================================
// 문서 유형 및 의도 분석 타입
// ============================================

/**
 * 문서 유형
 */
export type DocumentType =
  | 'ADVERTISEMENT'       // 광고
  | 'INFORMATION'         // 정보 제공
  | 'REGULATION'          // 규정/법률 안내
  | 'EDUCATION'           // 교육 자료
  | 'NEWS'                // 뉴스/기사
  | 'REVIEW'              // 리뷰/후기
  | 'FAQ'                 // FAQ
  | 'UNKNOWN';            // 불명

/**
 * 광고 의도 분석 결과
 */
export interface IntentAnalysis {
  /** 문서 유형 */
  documentType: DocumentType;
  /** 광고 의도 확률 (0-1) */
  advertisingIntentProbability: number;
  /** 프로모션 요소 발견 */
  hasPromotionalElements: boolean;
  /** 행동 유도 요소 발견 */
  hasCallToAction: boolean;
  /** 긴급성 요소 발견 */
  hasUrgency: boolean;
  /** 가격 정보 포함 */
  hasPriceInfo: boolean;
  /** 연락처 정보 포함 */
  hasContactInfo: boolean;
  /** 감지된 광고 신호 */
  advertisingSignals: string[];
  /** 분석 신뢰도 */
  confidence: number;
}

/**
 * 대상 청중 분석 결과
 */
export interface TargetAudienceAnalysis {
  /** 특정 연령대 타겟팅 */
  ageTargeting: string[];
  /** 특정 성별 타겟팅 */
  genderTargeting: string[];
  /** 특정 고민/증상 타겟팅 */
  concernTargeting: string[];
  /** 취약 계층 타겟팅 여부 */
  targetsVulnerableGroups: boolean;
  /** 취약 계층 유형 */
  vulnerableGroupTypes: string[];
}

/**
 * 문맥 유효성 검증 결과
 */
export interface ContextValidation {
  /** 맥락상 위반 가능성 */
  isLikelyViolation: boolean;
  /** 근거 */
  reasoning: string;
  /** 면책/경고문구 존재 */
  hasDisclaimer: boolean;
  /** 면책문구 내용 */
  disclaimerContent?: string;
  /** 객관적 근거 존재 */
  hasObjectiveEvidence: boolean;
  /** 조건부 표현 사용 */
  usesConditionalLanguage: boolean;
  /** 신뢰도 조정 값 (-1 ~ 1) */
  confidenceAdjustment: number;
}

// ============================================
// 광고 의도 감지 패턴
// ============================================

/**
 * 광고 신호 패턴
 */
const ADVERTISING_SIGNAL_PATTERNS: Array<{ pattern: RegExp; signal: string; weight: number }> = [
  // 행동 유도
  { pattern: /지금\s*(바로|즉시)\s*(상담|예약|문의)/gi, signal: 'call_to_action_urgent', weight: 0.2 },
  { pattern: /(상담|예약)\s*(받으세요|하세요|문의)/gi, signal: 'call_to_action', weight: 0.15 },
  { pattern: /(전화|카톡|카카오)\s*(주세요|문의)/gi, signal: 'contact_request', weight: 0.1 },
  { pattern: /(클릭|눌러|터치)\s*(하세요|주세요)/gi, signal: 'click_action', weight: 0.1 },

  // 긴급성
  { pattern: /(오늘|이번\s*주|이번\s*달)\s*(만|까지|한정)/gi, signal: 'urgency_time', weight: 0.2 },
  { pattern: /(선착순|마감\s*임박|곧\s*종료)/gi, signal: 'urgency_scarcity', weight: 0.2 },
  { pattern: /(한정|특별)\s*(할인|이벤트|행사)/gi, signal: 'limited_offer', weight: 0.15 },

  // 가격/프로모션
  { pattern: /(\d+)%\s*(할인|세일|DC)/gi, signal: 'discount_percentage', weight: 0.15 },
  { pattern: /(무료|공짜|0원)\s*(상담|진료|체험)/gi, signal: 'free_offer', weight: 0.2 },
  { pattern: /(\d+,?\d*)\s*(원|만원)/gi, signal: 'price_mention', weight: 0.1 },
  { pattern: /(이벤트|프로모션|특가)/gi, signal: 'promotion', weight: 0.15 },

  // 연락처
  { pattern: /(\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4})/g, signal: 'phone_number', weight: 0.1 },
  { pattern: /(카카오톡?|카톡)\s*:?\s*\S+/gi, signal: 'kakao_contact', weight: 0.1 },

  // 의료기관 광고 특성
  { pattern: /(병원|클리닉|의원)\s*(소개|안내)/gi, signal: 'medical_intro', weight: 0.1 },
  { pattern: /(시술|수술|치료)\s*(전|후)\s*(사진|이미지)/gi, signal: 'before_after_reference', weight: 0.15 },
];

/**
 * 비광고 신호 패턴 (광고 의도 감소)
 */
const NON_ADVERTISING_PATTERNS: Array<{ pattern: RegExp; signal: string; weight: number }> = [
  { pattern: /의료법\s*(제?\d+조|에\s*따라|에\s*의거)/gi, signal: 'legal_reference', weight: -0.2 },
  { pattern: /(연구|논문|학회)\s*(결과|발표|보고)/gi, signal: 'research_reference', weight: -0.15 },
  { pattern: /(주의사항|부작용|이상반응)\s*안내/gi, signal: 'warning_notice', weight: -0.15 },
  { pattern: /(개인\s*차이|결과가\s*다를|보장하지\s*않)/gi, signal: 'disclaimer', weight: -0.2 },
  { pattern: /(교육|설명|안내)\s*(자료|목적)/gi, signal: 'educational_purpose', weight: -0.15 },
  { pattern: /(기자|뉴스|보도|언론)/gi, signal: 'news_article', weight: -0.15 },
];

/**
 * 취약 계층 타겟팅 패턴
 */
const VULNERABLE_GROUP_PATTERNS: Array<{ pattern: RegExp; group: string; risk: string }> = [
  { pattern: /(청소년|미성년|학생)\s*(전용|특별|할인)/gi, group: '미성년자', risk: '미성년자 대상 의료광고' },
  { pattern: /(어르신|노인|실버)\s*(전용|특별|할인)/gi, group: '노인', risk: '노인 대상 취약 계층 마케팅' },
  { pattern: /(임산부|산모|출산)\s*(전용|특별)/gi, group: '임산부', risk: '임산부 대상 마케팅' },
  { pattern: /(다이어트|살\s*빼|체중\s*감량).*(고민|스트레스|우울)/gi, group: '체중 고민', risk: '체중 관련 심리적 취약점 이용' },
  { pattern: /(탈모|대머리).*(고민|스트레스|콤플렉스)/gi, group: '탈모 고민', risk: '탈모 관련 심리적 취약점 이용' },
  { pattern: /(주름|노화|늙|처짐).*(고민|스트레스|콤플렉스)/gi, group: '노화 고민', risk: '노화 관련 심리적 취약점 이용' },
];

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
  /** 광고 의도 분석 결과 */
  intentAnalysis?: IntentAnalysis;
  /** 대상 청중 분석 결과 */
  targetAudienceAnalysis?: TargetAudienceAnalysis;
  /** 문맥 유효성 검증 결과 */
  contextValidations?: ContextValidation[];
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
  // 추가 패턴 (맥락 분석 강화)
  {
    pattern: /(확실한?|틀림없는?|분명한?)\s*(효과|결과|변화)/gi,
    category: '확정적 효과 표현',
    description: '효과를 확정적으로 표현',
    examples: ['확실한 효과', '틀림없는 결과'],
  },
  {
    pattern: /(검증된?|입증된?|증명된?)\s*(효과|기술|방법)/gi,
    category: '검증 주장',
    description: '검증/입증을 주장 (근거 필요)',
    examples: ['검증된 효과', '입증된 기술'],
  },
  {
    pattern: /(유명|인기|인지도)\s*(높은|좋은|있는)/gi,
    category: '인기 주장',
    description: '유명세/인기 강조',
    examples: ['유명한 병원', '인기 있는 시술'],
  },
  {
    pattern: /(만족도|재방문율|추천율)\s*(\d+)?\s*%/gi,
    category: '통계 주장',
    description: '통계적 수치 제시 (근거 필요)',
    examples: ['만족도 98%', '재방문율 90%'],
  },
  {
    pattern: /(부담\s*없이?|저렴한?|합리적인?)\s*(가격|비용|금액)/gi,
    category: '가격 유인',
    description: '가격적 매력 강조',
    examples: ['부담 없는 가격', '합리적인 비용'],
  },
  {
    pattern: /(믿을\s*수\s*있는|신뢰할\s*수\s*있는|안심\s*할\s*수\s*있는)/gi,
    category: '신뢰성 강조',
    description: '무조건적 신뢰 강조',
    examples: ['믿을 수 있는 병원', '신뢰할 수 있는 의료진'],
  },
  {
    pattern: /(통증\s*없이?|무통|아프지\s*않)/gi,
    category: '무통 주장',
    description: '통증 없음을 단정 (맥락에 따라)',
    examples: ['통증 없이 시술', '무통 수술'],
  },
  {
    pattern: /(회복\s*기간\s*(?:없|짧|단축)|당일\s*퇴원|바로\s*일상)/gi,
    category: '회복 기간 주장',
    description: '빠른 회복을 강조',
    examples: ['회복 기간 없이', '당일 퇴원 가능'],
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

    // 광고 의도 분석
    const intentAnalysis = this.analyzeIntent(text);

    // 대상 청중 분석
    const targetAudienceAnalysis = this.analyzeTargetAudience(text);

    // 문맥 유효성 검증
    const contextValidations = patternMatches.map(match =>
      this.validateContext(text, match)
    );

    return {
      patternMatches,
      aiAnalyzedItems,
      additionalViolations,
      aiProcessingTimeMs: Date.now() - startTime,
      aiCallCount: aiAnalyzedItems.length,
      intentAnalysis,
      targetAudienceAnalysis,
      contextValidations,
    };
  }

  /**
   * 광고 의도 분석
   */
  analyzeIntent(text: string): IntentAnalysis {
    const advertisingSignals: string[] = [];
    let intentScore = 0;

    // 광고 신호 패턴 검사
    for (const { pattern, signal, weight } of ADVERTISING_SIGNAL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        advertisingSignals.push(signal);
        intentScore += weight;
      }
    }

    // 비광고 신호 패턴 검사 (점수 감소)
    for (const { pattern, signal, weight } of NON_ADVERTISING_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        advertisingSignals.push(signal);
        intentScore += weight; // 음수 가중치
      }
    }

    // 점수 정규화 (0-1)
    const normalizedScore = Math.max(0, Math.min(1, intentScore));

    // 요소 감지
    const hasCallToAction = advertisingSignals.some(s =>
      s.includes('call_to_action') || s.includes('click_action')
    );
    const hasUrgency = advertisingSignals.some(s => s.includes('urgency'));
    const hasPriceInfo = advertisingSignals.some(s =>
      s.includes('discount') || s.includes('price') || s.includes('free_offer')
    );
    const hasContactInfo = advertisingSignals.some(s =>
      s.includes('phone') || s.includes('kakao') || s.includes('contact')
    );
    const hasPromotionalElements = advertisingSignals.some(s =>
      s.includes('promotion') || s.includes('limited') || s.includes('offer')
    );

    // 문서 유형 결정
    const documentType = this.determineDocumentType(text, advertisingSignals, normalizedScore);

    return {
      documentType,
      advertisingIntentProbability: normalizedScore,
      hasPromotionalElements,
      hasCallToAction,
      hasUrgency,
      hasPriceInfo,
      hasContactInfo,
      advertisingSignals,
      confidence: Math.min(0.95, 0.6 + advertisingSignals.length * 0.05),
    };
  }

  /**
   * 문서 유형 결정
   */
  private determineDocumentType(
    text: string,
    signals: string[],
    intentScore: number
  ): DocumentType {
    // 법적 참조가 있으면 규정
    if (signals.includes('legal_reference')) return 'REGULATION';

    // 뉴스 관련 신호
    if (signals.includes('news_article')) return 'NEWS';

    // 교육 목적
    if (signals.includes('educational_purpose')) return 'EDUCATION';

    // 연구/논문 참조
    if (signals.includes('research_reference')) return 'INFORMATION';

    // 광고 의도 점수가 높으면 광고
    if (intentScore >= 0.5) return 'ADVERTISEMENT';

    // FAQ 패턴 검사
    if (/(?:Q\s*[.:]|질문\s*[.:]|자주\s*묻는|FAQ)/gi.test(text)) return 'FAQ';

    // 후기/리뷰 패턴
    if (/(?:후기|리뷰|경험담|체험기)/gi.test(text)) return 'REVIEW';

    // 정보 제공성 패턴
    if (/(?:안내|설명|소개|정보)/gi.test(text)) return 'INFORMATION';

    return 'UNKNOWN';
  }

  /**
   * 대상 청중 분석
   */
  analyzeTargetAudience(text: string): TargetAudienceAnalysis {
    const ageTargeting: string[] = [];
    const genderTargeting: string[] = [];
    const concernTargeting: string[] = [];
    const vulnerableGroupTypes: string[] = [];

    // 연령대 타겟팅 검사
    const agePatterns: Array<{ pattern: RegExp; age: string }> = [
      { pattern: /(20대|이십대|젊은)/gi, age: '20대' },
      { pattern: /(30대|삼십대)/gi, age: '30대' },
      { pattern: /(40대|사십대|중년)/gi, age: '40대' },
      { pattern: /(50대|오십대)/gi, age: '50대' },
      { pattern: /(60대|육십대|시니어|실버)/gi, age: '60대+' },
      { pattern: /(청소년|10대|십대)/gi, age: '10대' },
    ];

    for (const { pattern, age } of agePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        ageTargeting.push(age);
      }
    }

    // 성별 타겟팅 검사
    if (/(?:남성|남자|남성분|아버지|아빠)/gi.test(text)) {
      genderTargeting.push('남성');
    }
    if (/(?:여성|여자|여성분|어머니|엄마|주부)/gi.test(text)) {
      genderTargeting.push('여성');
    }

    // 고민 타겟팅 검사
    const concernPatterns: Array<{ pattern: RegExp; concern: string }> = [
      { pattern: /(다이어트|살\s*빼|체중)/gi, concern: '체중 관리' },
      { pattern: /(탈모|머리카락|모발)/gi, concern: '탈모' },
      { pattern: /(주름|피부\s*노화|처짐)/gi, concern: '피부 노화' },
      { pattern: /(여드름|트러블|피부\s*고민)/gi, concern: '피부 트러블' },
      { pattern: /(임신|출산|산후)/gi, concern: '출산/산후' },
      { pattern: /(성형|코|눈|가슴|지방)/gi, concern: '외모 개선' },
      { pattern: /(치아|잇몸|치과)/gi, concern: '치아 건강' },
      { pattern: /(관절|무릎|허리|척추)/gi, concern: '관절/척추' },
    ];

    for (const { pattern, concern } of concernPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        concernTargeting.push(concern);
      }
    }

    // 취약 계층 타겟팅 검사
    for (const { pattern, group, risk } of VULNERABLE_GROUP_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        vulnerableGroupTypes.push(`${group}: ${risk}`);
      }
    }

    return {
      ageTargeting,
      genderTargeting,
      concernTargeting,
      targetsVulnerableGroups: vulnerableGroupTypes.length > 0,
      vulnerableGroupTypes,
    };
  }

  /**
   * 문맥 유효성 검증
   */
  validateContext(text: string, match: PatternMatch): ContextValidation {
    const matchStart = match.position;
    const matchEnd = match.endPosition;

    // 문장 추출 (매칭된 표현이 포함된 문장)
    const sentenceStart = this.findSentenceStart(text, matchStart);
    const sentenceEnd = this.findSentenceEnd(text, matchEnd);
    const sentence = text.slice(sentenceStart, sentenceEnd);

    // 면책 조항 검사
    const disclaimerPatterns = [
      /개인\s*(?:마다\s*)?(?:차이|결과)/,
      /(?:부작용|이상\s*반응)\s*(?:이|가)\s*(?:있을|발생|나타날)/,
      /(?:전문의|의사)\s*(?:와|과)\s*(?:상담|상의)/,
      /(?:결과|효과)\s*(?:를\s*)?보장\s*(?:하지\s*)?않/,
      /(?:사전\s*)?(?:상담|검사)\s*(?:이|가)\s*(?:필요|필수)/,
    ];

    let hasDisclaimer = false;
    let disclaimerContent: string | undefined;

    for (const pattern of disclaimerPatterns) {
      const disclaimerMatch = text.match(pattern);
      if (disclaimerMatch) {
        hasDisclaimer = true;
        disclaimerContent = disclaimerMatch[0];
        break;
      }
    }

    // 객관적 근거 검사
    const evidencePatterns = [
      /(?:연구|논문|학회)\s*(?:결과|발표|보고)/,
      /(?:임상|실험)\s*(?:결과|데이터)/,
      /(?:식약처|FDA|CE)\s*(?:허가|승인|인증)/,
      /(?:\d+)?\s*%\s*(?:의|가)\s*(?:환자|분)/,
    ];

    const hasObjectiveEvidence = evidencePatterns.some(p => p.test(text));

    // 조건부 표현 검사
    const conditionalPatterns = [
      /(?:경우에\s*따라|상황에\s*따라)/,
      /(?:~?할\s*수\s*있|~?될\s*수\s*있)/,
      /(?:기대|예상)\s*(?:할\s*수\s*있|됩니다)/,
      /(?:개인\s*차이)/,
    ];

    const usesConditionalLanguage = conditionalPatterns.some(p => p.test(sentence));

    // 신뢰도 조정 계산
    let confidenceAdjustment = 0;

    if (hasDisclaimer) confidenceAdjustment -= 0.15;
    if (hasObjectiveEvidence) confidenceAdjustment -= 0.1;
    if (usesConditionalLanguage) confidenceAdjustment -= 0.1;

    // 강화 요소 (위반 가능성 증가)
    if (/(?:100%|완벽|확실|틀림없)/i.test(sentence)) confidenceAdjustment += 0.2;
    if (/(?:보장|약속)/i.test(sentence)) confidenceAdjustment += 0.15;
    if (/(?:부작용\s*없|안전\s*함)/i.test(sentence)) confidenceAdjustment += 0.15;

    // 맥락상 위반 가능성 판단
    const adjustedConfidence = match.confidence + confidenceAdjustment;
    const isLikelyViolation = adjustedConfidence >= 0.7;

    let reasoning = '';
    if (isLikelyViolation) {
      reasoning = '맥락 분석 결과 위반 가능성이 높음';
      if (/(?:100%|완벽|확실|보장)/i.test(sentence)) {
        reasoning += ' (확정적 표현 사용)';
      }
    } else {
      reasoning = '맥락 분석 결과 위반 가능성이 낮음';
      if (hasDisclaimer) {
        reasoning += ' (면책 조항 존재)';
      }
      if (usesConditionalLanguage) {
        reasoning += ' (조건부 표현 사용)';
      }
    }

    return {
      isLikelyViolation,
      reasoning,
      hasDisclaimer,
      disclaimerContent,
      hasObjectiveEvidence,
      usesConditionalLanguage,
      confidenceAdjustment,
    };
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
