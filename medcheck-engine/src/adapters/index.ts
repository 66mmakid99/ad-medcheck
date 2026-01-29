/**
 * Adapters 모듈 엔트리 포인트
 * 외부 시스템 연동 어댑터들을 export
 */

// SCV Adapter
export {
  SCVAdapter,
  scvAdapter,
  MockSCVClient,
} from './scv-adapter';
export type {
  SCVCrawlResult,
  SCVMetadata,
  SCVSearchOptions,
  SCVAdapterConfig,
  ISCVClient,
} from './scv-adapter';

// OCR Adapter
export {
  OCRAdapter,
  ocrAdapter,
  MockOCRClient,
} from './ocr-adapter';
export type {
  OCRResult,
  OCRTextRegion,
  OCROptions,
  OCRAdapterConfig,
  OCRSummary,
  IOCRClient,
} from './ocr-adapter';
