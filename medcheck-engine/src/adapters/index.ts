/**
 * Adapters 모듈 엔트리 포인트
 *
 * NOTE: SCV(크롤링) 어댑터는 madmedscv로 이관되어 삭제됨.
 * OCR 어댑터는 analyze-url에서 아직 사용 중이며, 향후 madmedscv로 이관 예정.
 */

// OCR Adapter (런타임)
export {
  OCRAdapter,
  ocrAdapter,
} from './ocr-adapter';

// OCR Adapter (타입 — ocr-types.ts에서 re-export)
export type {
  OCRResult,
  OCRTextRegion,
  OCROptions,
  IOCRClient,
  ExtractedPrice,
  ImageViolation,
  VisualEmphasis,
  PriceAdValidation,
  ImageClassification,
  ImageClassificationType,
  PriceType,
} from '../types/ocr-types';

// OCR Adapter 내부 타입
export type {
  OCRAdapterConfig,
  OCRSummary,
} from './ocr-adapter';
