/**
 * 가격 정보 저장 모듈
 * OCR 추출 결과를 D1 데이터베이스에 저장
 */

import type { D1Database } from '../db/d1';
import type {
  OCRResult,
  ExtractedPrice,
  ImageViolation,
  VisualEmphasis,
} from '../adapters/ocr-adapter';
import type { PriceAdValidationResult } from './price-ad-validator';

// ============================================
// 타입 정의
// ============================================

/**
 * OCR 결과 저장 입력
 */
export interface SaveOCRResultInput {
  /** OCR 결과 */
  ocrResult: OCRResult;
  /** 병원 ID (옵션) */
  hospitalId?: number;
  /** 출처 페이지 URL */
  sourceUrl?: string;
}

/**
 * 가격 저장 입력
 */
export interface SaveExtractedPriceInput {
  /** OCR 결과 ID */
  ocrResultId: number;
  /** 추출된 가격 */
  price: ExtractedPrice;
  /** 병원 ID (옵션) */
  hospitalId?: number;
  /** 검증 결과 */
  validationResult?: PriceAdValidationResult;
}

/**
 * 저장 결과
 */
export interface SaveResult {
  success: boolean;
  id?: number;
  error?: string;
}

/**
 * 일괄 저장 결과
 */
export interface BatchSaveResult {
  ocrResultId: number;
  priceIds: number[];
  violationIds: number[];
  errors: string[];
}

/**
 * 저장된 OCR 결과 조회 옵션
 */
export interface QueryOCRResultsOptions {
  hospitalId?: number;
  classificationType?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'processing_time_ms';
  orderDir?: 'asc' | 'desc';
}

/**
 * 저장된 가격 조회 옵션
 */
export interface QueryExtractedPricesOptions {
  hospitalId?: number;
  procedureName?: string;
  validationStatus?: 'COMPLIANT' | 'VIOLATION' | 'PENDING';
  minRiskScore?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'price' | 'risk_score';
  orderDir?: 'asc' | 'desc';
}

// ============================================
// 가격 저장 클래스
// ============================================

/**
 * 가격 정보 저장기
 */
export class PriceSaver {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * OCR 결과 저장
   */
  async saveOCRResult(input: SaveOCRResultInput): Promise<SaveResult> {
    const { ocrResult, hospitalId, sourceUrl } = input;

    try {
      const result = await this.db
        .prepare(
          `INSERT INTO ocr_results (
            hospital_id, image_url, source_url, classification_type,
            classification_confidence, extracted_text, text_confidence,
            visual_emphasis, violations, processing_time_ms, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          hospitalId || null,
          ocrResult.imageUrl,
          sourceUrl || null,
          ocrResult.classification?.type || null,
          ocrResult.classification?.confidence || null,
          ocrResult.text || null,
          ocrResult.confidence || null,
          ocrResult.visualEmphasis ? JSON.stringify(ocrResult.visualEmphasis) : null,
          ocrResult.violations ? JSON.stringify(ocrResult.violations) : null,
          ocrResult.processingTime || null,
          ocrResult.error || null
        )
        .run();

      return {
        success: true,
        id: result.meta.last_row_id as number,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 추출된 가격 저장
   */
  async saveExtractedPrice(input: SaveExtractedPriceInput): Promise<SaveResult> {
    const { ocrResultId, price, hospitalId, validationResult } = input;

    try {
      const result = await this.db
        .prepare(
          `INSERT INTO extracted_prices (
            ocr_result_id, hospital_id, procedure_name, normalized_procedure,
            price, original_price, discount_rate, shots, area, price_type,
            original_text, extraction_confidence, price_per_unit,
            is_promotion, has_time_limit, conditions,
            validation_status, validation_result, risk_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ocrResultId,
          hospitalId || null,
          price.procedureName,
          price.normalizedProcedure || null,
          price.price,
          price.originalPrice || null,
          price.discountRate || null,
          price.shots || null,
          price.area || null,
          price.priceType,
          price.originalText,
          price.confidence,
          price.pricePerUnit || null,
          price.isPromotion ? 1 : 0,
          price.hasTimeLimit ? 1 : 0,
          price.conditions || null,
          validationResult ? (validationResult.isCompliant ? 'COMPLIANT' : 'VIOLATION') : 'PENDING',
          validationResult ? JSON.stringify(validationResult) : null,
          validationResult?.riskScore || null
        )
        .run();

      const priceId = result.meta.last_row_id as number;

      // 가격 광고 위반 기록 저장
      if (validationResult && validationResult.violations.length > 0) {
        await this.savePriceAdViolations(priceId, validationResult.violations);
      }

      return {
        success: true,
        id: priceId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 가격 광고 위반 기록 저장
   */
  private async savePriceAdViolations(
    extractedPriceId: number,
    violations: PriceAdValidationResult['violations']
  ): Promise<void> {
    for (const violation of violations) {
      await this.db
        .prepare(
          `INSERT INTO price_ad_violations (
            extracted_price_id, rule_code, rule_name, description, severity
          ) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          extractedPriceId,
          violation.ruleCode,
          violation.ruleName,
          violation.description,
          violation.severity
        )
        .run();
    }
  }

  /**
   * 이미지 위반 저장
   */
  async saveImageViolation(
    ocrResultId: number,
    violation: ImageViolation
  ): Promise<SaveResult> {
    try {
      const result = await this.db
        .prepare(
          `INSERT INTO image_violations (
            ocr_result_id, violation_type, related_text, severity,
            description, legal_basis, confidence
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ocrResultId,
          violation.type,
          violation.text,
          violation.severity,
          violation.description,
          violation.legalBasis || null,
          violation.confidence
        )
        .run();

      return {
        success: true,
        id: result.meta.last_row_id as number,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * OCR 결과 및 관련 데이터 일괄 저장
   */
  async saveOCRResultWithPrices(
    input: SaveOCRResultInput,
    validationResults?: PriceAdValidationResult[]
  ): Promise<BatchSaveResult> {
    const errors: string[] = [];
    const priceIds: number[] = [];
    const violationIds: number[] = [];

    // 1. OCR 결과 저장
    const ocrSaveResult = await this.saveOCRResult(input);
    if (!ocrSaveResult.success || !ocrSaveResult.id) {
      return {
        ocrResultId: 0,
        priceIds: [],
        violationIds: [],
        errors: [ocrSaveResult.error || 'Failed to save OCR result'],
      };
    }

    const ocrResultId = ocrSaveResult.id;

    // 2. 추출된 가격 저장
    if (input.ocrResult.extractedPrices) {
      for (let i = 0; i < input.ocrResult.extractedPrices.length; i++) {
        const price = input.ocrResult.extractedPrices[i];
        const validation = validationResults?.[i];

        const priceSaveResult = await this.saveExtractedPrice({
          ocrResultId,
          price,
          hospitalId: input.hospitalId,
          validationResult: validation,
        });

        if (priceSaveResult.success && priceSaveResult.id) {
          priceIds.push(priceSaveResult.id);
        } else {
          errors.push(priceSaveResult.error || `Failed to save price: ${price.procedureName}`);
        }
      }
    }

    // 3. 이미지 위반 저장
    if (input.ocrResult.violations) {
      for (const violation of input.ocrResult.violations) {
        const violationSaveResult = await this.saveImageViolation(ocrResultId, violation);
        if (violationSaveResult.success && violationSaveResult.id) {
          violationIds.push(violationSaveResult.id);
        } else {
          errors.push(violationSaveResult.error || `Failed to save violation: ${violation.type}`);
        }
      }
    }

    return {
      ocrResultId,
      priceIds,
      violationIds,
      errors,
    };
  }

  /**
   * OCR 결과 조회
   */
  async queryOCRResults(options: QueryOCRResultsOptions = {}): Promise<any[]> {
    const {
      hospitalId,
      classificationType,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'desc',
    } = options;

    let query = 'SELECT * FROM ocr_results WHERE 1=1';
    const params: (number | string)[] = [];

    if (hospitalId !== undefined) {
      query += ' AND hospital_id = ?';
      params.push(hospitalId);
    }

    if (classificationType) {
      query += ' AND classification_type = ?';
      params.push(classificationType);
    }

    query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results || [];
  }

  /**
   * 추출된 가격 조회
   */
  async queryExtractedPrices(options: QueryExtractedPricesOptions = {}): Promise<any[]> {
    const {
      hospitalId,
      procedureName,
      validationStatus,
      minRiskScore,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'desc',
    } = options;

    let query = 'SELECT * FROM extracted_prices WHERE 1=1';
    const params: (number | string)[] = [];

    if (hospitalId !== undefined) {
      query += ' AND hospital_id = ?';
      params.push(hospitalId);
    }

    if (procedureName) {
      query += ' AND (procedure_name LIKE ? OR normalized_procedure LIKE ?)';
      params.push(`%${procedureName}%`, `%${procedureName}%`);
    }

    if (validationStatus) {
      query += ' AND validation_status = ?';
      params.push(validationStatus);
    }

    if (minRiskScore !== undefined) {
      query += ' AND risk_score >= ?';
      params.push(minRiskScore);
    }

    query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results || [];
  }

  /**
   * 가격 광고 위반 조회
   */
  async queryPriceAdViolations(
    options: {
      extractedPriceId?: number;
      ruleCode?: string;
      severity?: string;
      limit?: number;
    } = {}
  ): Promise<any[]> {
    const { extractedPriceId, ruleCode, severity, limit = 100 } = options;

    let query = 'SELECT * FROM price_ad_violations WHERE 1=1';
    const params: (number | string)[] = [];

    if (extractedPriceId !== undefined) {
      query += ' AND extracted_price_id = ?';
      params.push(extractedPriceId);
    }

    if (ruleCode) {
      query += ' AND rule_code = ?';
      params.push(ruleCode);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results || [];
  }

  /**
   * 이미지 위반 조회
   */
  async queryImageViolations(
    options: {
      ocrResultId?: number;
      violationType?: string;
      severity?: string;
      limit?: number;
    } = {}
  ): Promise<any[]> {
    const { ocrResultId, violationType, severity, limit = 100 } = options;

    let query = 'SELECT * FROM image_violations WHERE 1=1';
    const params: (number | string)[] = [];

    if (ocrResultId !== undefined) {
      query += ' AND ocr_result_id = ?';
      params.push(ocrResultId);
    }

    if (violationType) {
      query += ' AND violation_type = ?';
      params.push(violationType);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results || [];
  }

  /**
   * 병원별 추출 가격 요약 조회
   */
  async getHospitalPriceSummary(hospitalId: number): Promise<any> {
    const result = await this.db
      .prepare(
        `SELECT * FROM v_hospital_extracted_prices WHERE hospital_id = ?`
      )
      .bind(hospitalId)
      .first();

    return result;
  }

  /**
   * 시술별 가격 비교 데이터 조회
   */
  async getProcedurePriceComparison(procedureName?: string): Promise<any[]> {
    let query = 'SELECT * FROM v_procedure_price_comparison';
    const params: string[] = [];

    if (procedureName) {
      query += ' WHERE normalized_procedure LIKE ?';
      params.push(`%${procedureName}%`);
    }

    query += ' ORDER BY sample_count DESC';

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results || [];
  }

  /**
   * 통계 조회
   */
  async getStatistics(): Promise<{
    totalOCRResults: number;
    totalExtractedPrices: number;
    totalViolations: number;
    violationsByType: Record<string, number>;
    avgRiskScore: number;
  }> {
    const [ocrCount, priceCount, violationCount, violationsByType, avgRisk] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as count FROM ocr_results').first(),
      this.db.prepare('SELECT COUNT(*) as count FROM extracted_prices').first(),
      this.db.prepare('SELECT COUNT(*) as count FROM price_ad_violations').first(),
      this.db.prepare(
        `SELECT rule_code, COUNT(*) as count FROM price_ad_violations GROUP BY rule_code`
      ).all(),
      this.db.prepare('SELECT AVG(risk_score) as avg FROM extracted_prices WHERE risk_score IS NOT NULL').first(),
    ]);

    const typeMap: Record<string, number> = {};
    if (violationsByType.results) {
      for (const row of violationsByType.results as any[]) {
        typeMap[row.rule_code] = row.count;
      }
    }

    return {
      totalOCRResults: (ocrCount as any)?.count || 0,
      totalExtractedPrices: (priceCount as any)?.count || 0,
      totalViolations: (violationCount as any)?.count || 0,
      violationsByType: typeMap,
      avgRiskScore: (avgRisk as any)?.avg || 0,
    };
  }
}

// ============================================
// 팩토리 함수
// ============================================

/**
 * PriceSaver 인스턴스 생성
 */
export function createPriceSaver(db: D1Database): PriceSaver {
  return new PriceSaver(db);
}
