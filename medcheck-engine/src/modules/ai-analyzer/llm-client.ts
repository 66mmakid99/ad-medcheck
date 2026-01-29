/**
 * LLM 클라이언트
 * Claude/Gemini API 연동
 */

// ============================================
// 타입 정의
// ============================================

/**
 * LLM 제공자
 */
export type LLMProvider = 'claude' | 'gemini';

/**
 * LLM 설정
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * LLM 요청
 */
export interface LLMRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * LLM 응답
 */
export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
}

/**
 * 의료광고 분석 결과
 */
export interface AIAnalysisResult {
  /** 위반 여부 */
  isViolation: boolean;
  /** 확신도 (0-1) */
  confidence: number;
  /** 위반 유형 */
  violationType?: string;
  /** 판단 근거 */
  reasoning: string;
  /** 개선 제안 */
  suggestion?: string;
  /** 관련 법령 */
  legalReference?: string;
}

// ============================================
// LLM 클라이언트 클래스
// ============================================

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      maxTokens: 1024,
      temperature: 0.3,
      ...config,
    };
  }

  /**
   * LLM 호출
   */
  async call(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    if (this.config.provider === 'claude') {
      return this.callClaude(request, startTime);
    } else if (this.config.provider === 'gemini') {
      return this.callGemini(request, startTime);
    }

    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  /**
   * Claude API 호출
   */
  private async callClaude(request: LLMRequest, startTime: number): Promise<LLMResponse> {
    const model = this.config.model || 'claude-3-haiku-20240307';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens || this.config.maxTokens,
        temperature: request.temperature || this.config.temperature,
        system: request.system,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content[0]?.text || '',
      model,
      provider: 'claude',
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      } : undefined,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Gemini API 호출
   */
  private async callGemini(request: LLMRequest, startTime: number): Promise<LLMResponse> {
    const model = this.config.model || 'gemini-1.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: request.system
                    ? `${request.system}\n\n${request.prompt}`
                    : request.prompt,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens || this.config.maxTokens,
            temperature: request.temperature || this.config.temperature,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
    };

    return {
      content: data.candidates[0]?.content?.parts[0]?.text || '',
      model,
      provider: 'gemini',
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 의료광고 분석 프롬프트 실행
   */
  async analyzeAdText(text: string, context?: string): Promise<AIAnalysisResult> {
    const systemPrompt = `당신은 한국 의료법에 정통한 의료광고 심의 전문가입니다.
의료광고 텍스트를 분석하여 의료법 제56조 및 관련 규정 위반 여부를 판단합니다.

주요 위반 유형:
1. 치료효과 보장 (예: "100% 완치", "반드시 효과")
2. 부작용 부정/축소 (예: "부작용 전혀 없음")
3. 최상급/과장 표현 (예: "최고", "유일", "독보적")
4. 비교광고 (다른 의료기관 비하)
5. 환자 유인 (과도한 할인, 무료 제공)
6. 체험기/전후사진 부적절 사용

애매한 표현도 맥락을 고려하여 판단하세요:
- "많은 분들이 효과를 보셨습니다" → 암시적 효과 보장
- "자연스러운 결과" → 맥락에 따라 다름

응답 형식 (JSON):
{
  "isViolation": boolean,
  "confidence": 0.0-1.0,
  "violationType": "위반 유형 (없으면 null)",
  "reasoning": "판단 근거 설명",
  "suggestion": "개선 제안 (위반 시)",
  "legalReference": "관련 법령 조항"
}`;

    const userPrompt = context
      ? `다음 의료광고 텍스트를 분석해주세요.\n\n맥락: ${context}\n\n텍스트:\n${text}`
      : `다음 의료광고 텍스트를 분석해주세요.\n\n텍스트:\n${text}`;

    const response = await this.call({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1024,
      temperature: 0.2,
    });

    // JSON 파싱
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
        return result;
      }
    } catch (e) {
      // JSON 파싱 실패 시 기본 응답
    }

    // 파싱 실패 시 기본 응답
    return {
      isViolation: false,
      confidence: 0.5,
      reasoning: response.content,
    };
  }

  /**
   * 여러 텍스트 배치 분석
   */
  async analyzeBatch(
    texts: Array<{ text: string; context?: string }>
  ): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];

    for (const item of texts) {
      try {
        const result = await this.analyzeAdText(item.text, item.context);
        results.push(result);
      } catch (error) {
        results.push({
          isViolation: false,
          confidence: 0,
          reasoning: `분석 실패: ${(error as Error).message}`,
        });
      }
    }

    return results;
  }
}

/**
 * LLM 클라이언트 팩토리
 */
export function createLLMClient(
  provider: LLMProvider,
  apiKey: string,
  options?: Partial<LLMConfig>
): LLMClient {
  return new LLMClient({
    provider,
    apiKey,
    ...options,
  });
}
