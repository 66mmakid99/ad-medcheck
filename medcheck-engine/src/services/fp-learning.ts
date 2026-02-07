/**
 * FP Learning Service
 * ocr_feedback 테이블의 false_positive 피드백을 집계하여
 * 패턴별 FP 비율을 계산하고, 분석 시 참조할 오버라이드 데이터를 관리
 */

interface FpPatternStats {
  patternId: string;
  totalFeedback: number;
  fpCount: number;
  correctCount: number;
  fpRate: number;
  action: string;       // 'normal' | 'suppress' | 'boost'
  confidencePenalty: number;
  updatedAt: string;
}

interface FpOverride {
  patternId: string;
  action: string;
  fpRate: number;
  confidencePenalty: number;
}

/**
 * FP Learning 서비스 생성
 */
export function createFpLearning(db: any) {
  return {
    /**
     * ocr_feedback에서 패턴별 FP 통계 계산 → fp_pattern_overrides 갱신
     */
    async aggregateFpStats(): Promise<{ updated: number; flagged: string[] }> {
      // ocr_feedback에서 패턴별 집계
      const stats = await db.prepare(`
        SELECT
          pattern_id,
          COUNT(*) as total,
          SUM(CASE WHEN human_judgment = 'false_positive' THEN 1 ELSE 0 END) as fp_count,
          SUM(CASE WHEN human_judgment = 'correct' THEN 1 ELSE 0 END) as correct_count
        FROM ocr_feedback
        WHERE pattern_id IS NOT NULL AND pattern_id != ''
        GROUP BY pattern_id
        HAVING total >= 1
      `).all();

      let updated = 0;
      const flagged: string[] = [];

      for (const row of stats.results) {
        const total = (row as any).total as number;
        const fpCount = (row as any).fp_count as number;
        const correctCount = (row as any).correct_count as number;
        const fpRate = total > 0 ? fpCount / total : 0;

        // FP 비율에 따른 confidence penalty 계산
        // FP 비율 50% 이상이면 패턴 신뢰도 낮음
        const confidencePenalty = Math.min(fpRate, 0.5); // 최대 0.5 감점

        // 기존 action 유지 (수동 suppress는 보존)
        const existing = await db.prepare(
          `SELECT action FROM fp_pattern_overrides WHERE pattern_id = ?`
        ).bind((row as any).pattern_id).first();

        const action = existing?.action === 'suppress' ? 'suppress' : 'normal';

        await db.prepare(`
          INSERT INTO fp_pattern_overrides (pattern_id, action, fp_rate, total_feedback, fp_count, correct_count, confidence_penalty, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(pattern_id) DO UPDATE SET
            fp_rate = excluded.fp_rate,
            total_feedback = excluded.total_feedback,
            fp_count = excluded.fp_count,
            correct_count = excluded.correct_count,
            confidence_penalty = excluded.confidence_penalty,
            action = CASE WHEN fp_pattern_overrides.action = 'suppress' THEN 'suppress' ELSE excluded.action END,
            updated_at = datetime('now')
        `).bind(
          (row as any).pattern_id, action, fpRate, total, fpCount, correctCount, confidencePenalty
        ).run();

        updated++;

        if (fpRate >= 0.5) {
          flagged.push((row as any).pattern_id as string);
        }
      }

      return { updated, flagged };
    },

    /**
     * 모든 패턴의 FP 오버라이드 조회
     */
    async getAllOverrides(): Promise<FpPatternStats[]> {
      const result = await db.prepare(`
        SELECT * FROM fp_pattern_overrides ORDER BY fp_rate DESC
      `).all();

      return result.results.map((r: any) => ({
        patternId: r.pattern_id,
        totalFeedback: r.total_feedback,
        fpCount: r.fp_count,
        correctCount: r.correct_count,
        fpRate: r.fp_rate,
        action: r.action,
        confidencePenalty: r.confidence_penalty,
        updatedAt: r.updated_at,
      }));
    },

    /**
     * 분석 시 사용할 suppress 목록 + FP 페널티 맵 조회
     */
    async getActiveOverrides(): Promise<{
      suppressedPatternIds: Set<string>;
      fpPenaltyMap: Map<string, FpOverride>;
    }> {
      const result = await db.prepare(`
        SELECT pattern_id, action, fp_rate, confidence_penalty
        FROM fp_pattern_overrides
        WHERE action = 'suppress' OR fp_rate > 0
      `).all();

      const suppressedPatternIds = new Set<string>();
      const fpPenaltyMap = new Map<string, FpOverride>();

      for (const row of result.results) {
        const r = row as any;
        if (r.action === 'suppress') {
          suppressedPatternIds.add(r.pattern_id);
        }
        if (r.fp_rate > 0) {
          fpPenaltyMap.set(r.pattern_id, {
            patternId: r.pattern_id,
            action: r.action,
            fpRate: r.fp_rate,
            confidencePenalty: r.confidence_penalty,
          });
        }
      }

      return { suppressedPatternIds, fpPenaltyMap };
    },

    /**
     * 패턴 suppress/활성화 토글
     */
    async setPatternAction(patternId: string, action: 'suppress' | 'normal'): Promise<void> {
      await db.prepare(`
        INSERT INTO fp_pattern_overrides (pattern_id, action, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(pattern_id) DO UPDATE SET
          action = excluded.action,
          updated_at = datetime('now')
      `).bind(patternId, action).run();
    },

    /**
     * Gemini 프롬프트에 추가할 FP 컨텍스트 생성
     */
    async buildFpContext(): Promise<string> {
      const highFpPatterns = await db.prepare(`
        SELECT pattern_id, fp_rate, fp_count, total_feedback
        FROM fp_pattern_overrides
        WHERE fp_rate >= 0.3 AND total_feedback >= 3
        ORDER BY fp_rate DESC
        LIMIT 10
      `).all();

      if (highFpPatterns.results.length === 0) return '';

      const lines = highFpPatterns.results.map((r: any) =>
        `- ${r.pattern_id}: 오탐율 ${Math.round(r.fp_rate * 100)}% (${r.fp_count}/${r.total_feedback}건)`
      );

      return `\n## 오탐 이력 주의 패턴\n아래 패턴은 과거 피드백에서 오탐이 많았습니다. 더 엄격하게 문맥을 확인하고, 실제 위반이 확실한 경우에만 높은 confidence를 부여하세요.\n${lines.join('\n')}\n`;
    },
  };
}
