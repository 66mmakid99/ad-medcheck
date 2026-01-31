/**
 * 진료과목별 특화 규칙
 * 각 진료과목의 특성에 맞는 위반 탐지 규칙 정의
 *
 * 지원 진료과목:
 * - 피부과 (dermatology)
 * - 성형외과 (plastic_surgery)
 * - 치과 (dental)
 * - 한의원 (oriental)
 * - 정신건강의학과 (psychiatry)
 * - 안과 (ophthalmology)
 * - 일반 (general)
 */

// ============================================
// 타입 정의
// ============================================

/**
 * 진료과목 유형
 */
export type DepartmentType =
  | 'dermatology'       // 피부과
  | 'plastic_surgery'   // 성형외과
  | 'dental'            // 치과
  | 'oriental'          // 한의원
  | 'psychiatry'        // 정신건강의학과
  | 'ophthalmology'     // 안과
  | 'orthopedics'       // 정형외과
  | 'internal'          // 내과
  | 'general';          // 일반/기타

/**
 * 진료과목별 규칙 정의
 */
export interface DepartmentRule {
  /** 규칙 ID */
  id: string;
  /** 진료과목 */
  department: DepartmentType;
  /** 규칙명 */
  name: string;
  /** 설명 */
  description: string;
  /** 패턴 */
  patterns: RegExp[];
  /** 심각도 */
  severity: 'critical' | 'major' | 'minor';
  /** 법적 근거 */
  legalBasis: string;
  /** 권장 조치 */
  suggestion: string;
  /** 예외 패턴 */
  exceptions?: RegExp[];
}

/**
 * 진료과목별 위반 탐지 결과
 */
export interface DepartmentViolation {
  /** 규칙 ID */
  ruleId: string;
  /** 진료과목 */
  department: DepartmentType;
  /** 규칙명 */
  ruleName: string;
  /** 매칭된 텍스트 */
  matchedText: string;
  /** 맥락 */
  context: string;
  /** 위치 */
  position: number;
  /** 끝 위치 */
  endPosition: number;
  /** 심각도 */
  severity: 'critical' | 'major' | 'minor';
  /** 법적 근거 */
  legalBasis: string;
  /** 설명 */
  description: string;
  /** 권장 조치 */
  suggestion: string;
  /** 신뢰도 */
  confidence: number;
}

/**
 * 진료과목 감지 결과
 */
export interface DepartmentDetectionResult {
  /** 감지된 진료과목 */
  department: DepartmentType;
  /** 신뢰도 */
  confidence: number;
  /** 감지 근거 */
  evidence: string[];
}

// ============================================
// 진료과목 감지 패턴
// ============================================

const DEPARTMENT_PATTERNS: Array<{
  department: DepartmentType;
  patterns: RegExp[];
  keywords: string[];
}> = [
  {
    department: 'dermatology',
    patterns: [
      /피부과|피부\s*클리닉|피부\s*전문/gi,
      /여드름|모공|피부\s*톤|색소|기미|주근깨/gi,
      /레이저\s*토닝|보톡스|필러|리프팅/gi,
      /피부\s*관리|스킨\s*케어|피부\s*시술/gi,
    ],
    keywords: ['피부', '여드름', '레이저', '보톡스', '필러', '기미', '주근깨', '미백'],
  },
  {
    department: 'plastic_surgery',
    patterns: [
      /성형외과|성형\s*클리닉|성형\s*전문/gi,
      /코\s*성형|눈\s*성형|안면\s*윤곽|지방\s*흡입/gi,
      /가슴\s*성형|쌍꺼풀|눈매\s*교정|코끝/gi,
      /리프팅|페이스\s*리프트|턱\s*수술/gi,
    ],
    keywords: ['성형', '쌍꺼풀', '코', '가슴', '지방흡입', '리프팅', '안면윤곽'],
  },
  {
    department: 'dental',
    patterns: [
      /치과|치아|치료|잇몸|치주/gi,
      /임플란트|교정|라미네이트|치아\s*미백/gi,
      /충치|발치|신경\s*치료|스케일링/gi,
      /투명\s*교정|교정\s*치료|치아\s*교정/gi,
    ],
    keywords: ['치과', '임플란트', '교정', '잇몸', '충치', '발치', '라미네이트'],
  },
  {
    department: 'oriental',
    patterns: [
      /한의원|한방|한의|침\s*치료/gi,
      /한약|약침|추나|부항|뜸/gi,
      /다이어트\s*한약|보약|체질/gi,
      /한방\s*치료|경락|기혈/gi,
    ],
    keywords: ['한의원', '한약', '침', '추나', '부항', '한방', '체질'],
  },
  {
    department: 'psychiatry',
    patterns: [
      /정신건강의학과|정신과|신경정신과/gi,
      /우울증|불안|공황\s*장애|불면증/gi,
      /ADHD|조현병|양극성\s*장애/gi,
      /상담|심리\s*치료|정신\s*건강/gi,
    ],
    keywords: ['정신과', '우울증', '불안', '공황', '불면증', '상담', 'ADHD'],
  },
  {
    department: 'ophthalmology',
    patterns: [
      /안과|눈\s*병원|눈\s*클리닉/gi,
      /라식|라섹|스마일\s*라식|렌즈삽입술/gi,
      /백내장|녹내장|망막|시력\s*교정/gi,
      /노안|다초점|렌즈/gi,
    ],
    keywords: ['안과', '라식', '라섹', '백내장', '녹내장', '시력', '노안'],
  },
  {
    department: 'orthopedics',
    patterns: [
      /정형외과|관절|척추/gi,
      /디스크|허리|목|무릎/gi,
      /인공관절|척추\s*수술|관절염/gi,
      /물리\s*치료|도수\s*치료|재활/gi,
    ],
    keywords: ['정형외과', '관절', '척추', '디스크', '무릎', '허리', '인공관절'],
  },
  {
    department: 'internal',
    patterns: [
      /내과|종합\s*검진|건강\s*검진/gi,
      /당뇨|고혈압|고지혈증/gi,
      /소화기|호흡기|순환기/gi,
      /내시경|초음파|CT|MRI/gi,
    ],
    keywords: ['내과', '검진', '당뇨', '고혈압', '내시경', '소화기'],
  },
];

// ============================================
// 진료과목별 특화 규칙 정의
// ============================================

const DEPARTMENT_RULES: DepartmentRule[] = [
  // ========== 피부과 ==========
  {
    id: 'DERM-001',
    department: 'dermatology',
    name: '시술 횟수 과소 표현',
    description: '레이저/시술 횟수를 적게 표현하여 효과 과장',
    patterns: [
      /(?:단\s*)?(?:1|한)\s*회\s*(?:만으로|로)\s*(?:효과|완료|해결)/gi,
      /(?:1|한)\s*번\s*(?:에|으로)\s*(?:끝|완료|해결)/gi,
      /원\s*샷\s*(?:레이저|시술)/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '필요한 시술 횟수에 대한 정확한 정보를 제공하세요',
    exceptions: [/개인\s*(?:차이|마다|에\s*따라)/],
  },
  {
    id: 'DERM-002',
    department: 'dermatology',
    name: '피부 완벽 재생 주장',
    description: '피부 완벽 재생/복구를 보장하는 표현',
    patterns: [
      /피부\s*(?:완벽|완전)\s*(?:재생|복구|회복)/gi,
      /(?:새|baby)\s*살\s*(?:처럼|같이)/gi,
      /(?:모공|주름)\s*(?:완전|100%)\s*(?:제거|소멸)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '피부 개선 효과로 표현하고 개인차 가능성을 명시하세요',
  },
  {
    id: 'DERM-003',
    department: 'dermatology',
    name: '여드름 완치 보장',
    description: '여드름 완치/재발 방지를 보장',
    patterns: [
      /여드름\s*(?:완치|완전\s*치료|근본\s*치료)/gi,
      /(?:재발\s*없|다시는\s*안)\s*(?:는|나는|생기)/gi,
      /여드름\s*(?:영구|평생)\s*(?:제거|해결)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '여드름 관리/개선으로 표현하세요',
  },

  // ========== 성형외과 ==========
  {
    id: 'PLST-001',
    department: 'plastic_surgery',
    name: '자연스러운 결과 보장',
    description: '수술 결과의 자연스러움을 보장',
    patterns: [
      /(?:100%|완벽)\s*자연스러운?\s*(?:결과|모습)/gi,
      /(?:티\s*안\s*나|눈치\s*못\s*챔?)/gi,
      /자연\s*그\s*자체/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '자연스러운 결과를 위해 노력한다고 표현하세요',
    exceptions: [/자연스러운\s*결과를\s*위해/],
  },
  {
    id: 'PLST-002',
    department: 'plastic_surgery',
    name: '흉터 없음 주장',
    description: '수술 흉터가 없다고 단정',
    patterns: [
      /(?:흉터|반흔)\s*(?:없|제로|0|zero)/gi,
      /(?:절개|흉터)\s*(?:없는|없이)\s*수술/gi,
      /노\s*스카?r?/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제2호',
    suggestion: '최소 흉터, 흉터 관리 등으로 표현하세요',
    exceptions: [/비절개/],
  },
  {
    id: 'PLST-003',
    department: 'plastic_surgery',
    name: '성형 효과 영구성 주장',
    description: '성형 효과가 영구적이라고 표현',
    patterns: [
      /(?:평생|영구적?|반영구)\s*(?:유지|효과|결과)/gi,
      /(?:다시는|재수술)\s*(?:필요\s*없|안\s*해도)/gi,
      /(?:한\s*번|1회)\s*(?:로|에)\s*평생/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '효과 유지 기간에 대한 정확한 정보를 제공하세요',
  },

  // ========== 치과 ==========
  {
    id: 'DENT-001',
    department: 'dental',
    name: '임플란트 평생 보장',
    description: '임플란트의 평생 사용을 보장',
    patterns: [
      /임플란트\s*평생\s*(?:보장|사용|유지)/gi,
      /(?:반영구|영구)\s*임플란트/gi,
      /임플란트\s*(?:한\s*번|1회)\s*(?:로|에)\s*평생/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '임플란트 수명 및 관리 필요성에 대해 정확히 안내하세요',
  },
  {
    id: 'DENT-002',
    department: 'dental',
    name: '무통 치료 단정',
    description: '치과 치료가 무통임을 단정',
    patterns: [
      /(?:무통|통증\s*없|아프지\s*않)\s*(?:치료|시술|발치|임플란트)/gi,
      /(?:전혀|절대)\s*(?:안\s*아프|무통)/gi,
      /통증\s*(?:제로|0|zero)/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제2호',
    suggestion: '통증 최소화를 위한 노력을 설명하세요',
    exceptions: [/통증을\s*최소화/],
  },
  {
    id: 'DENT-003',
    department: 'dental',
    name: '교정 기간 과소 표현',
    description: '치아 교정 기간을 과소하게 표현',
    patterns: [
      /(?:\d+)\s*(?:개월|일)\s*(?:만에|에)\s*완료/gi,
      /빠른\s*교정|급속\s*교정/gi,
      /(?:초|슈퍼)\s*?스피드\s*교정/gi,
    ],
    severity: 'minor',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '정확한 교정 기간 범위를 안내하세요',
    exceptions: [/개인\s*(?:차이|마다|에\s*따라)/],
  },

  // ========== 한의원 ==========
  {
    id: 'ORNT-001',
    department: 'oriental',
    name: '한약 효과 보장',
    description: '한약의 효과를 단정적으로 표현',
    patterns: [
      /한약\s*(?:만으로|으로)\s*(?:완치|완전\s*치료)/gi,
      /(?:체질\s*개선|면역력)\s*(?:확실|100%)/gi,
      /한방\s*(?:으로\s*)?(?:완치|근본\s*치료)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '한방 치료의 효과 가능성으로 표현하세요',
  },
  {
    id: 'ORNT-002',
    department: 'oriental',
    name: '다이어트 한약 효과 과장',
    description: '다이어트 한약의 효과를 과장',
    patterns: [
      /(?:\d+)\s*(?:kg|킬로)\s*(?:감량\s*)?(?:보장|확실)/gi,
      /(?:살\s*빠지는|체중\s*감량)\s*한약/gi,
      /(?:요요|부작용)\s*없는?\s*(?:다이어트|한약)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '체중 관리 지원 한약으로 표현하고 개인차를 명시하세요',
  },
  {
    id: 'ORNT-003',
    department: 'oriental',
    name: '침/추나 효과 과장',
    description: '침/추나 치료 효과를 과장',
    patterns: [
      /침\s*(?:한\s*번|1회)\s*(?:로|에)\s*(?:완치|해결)/gi,
      /추나\s*(?:만으로|로)\s*(?:완치|완전\s*교정)/gi,
      /(?:디스크|척추)\s*(?:완치|완전\s*치료)/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '증상 개선/관리로 표현하세요',
  },

  // ========== 정신건강의학과 ==========
  {
    id: 'PSYC-001',
    department: 'psychiatry',
    name: '정신질환 완치 보장',
    description: '정신질환 완치를 보장',
    patterns: [
      /(?:우울증|불안|공황)\s*(?:완치|완전\s*치료)/gi,
      /(?:정신|심리)\s*질환\s*(?:완치|근본\s*치료)/gi,
      /(?:재발\s*없|다시는)\s*(?:안|없)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '증상 관리 및 치료 지원으로 표현하세요',
  },
  {
    id: 'PSYC-002',
    department: 'psychiatry',
    name: '약물 부작용 부정',
    description: '정신과 약물의 부작용이 없다고 표현',
    patterns: [
      /(?:약물|정신과\s*약)\s*부작용\s*(?:없|제로|0)/gi,
      /(?:안전한?|무해한?)\s*(?:약물|정신과\s*약)/gi,
      /(?:중독|의존)\s*(?:없|걱정\s*없)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제2호',
    suggestion: '약물 부작용 가능성과 관리 방법을 안내하세요',
  },

  // ========== 안과 ==========
  {
    id: 'OPHT-001',
    department: 'ophthalmology',
    name: '시력 보장 표현',
    description: '라식/라섹 후 특정 시력을 보장',
    patterns: [
      /(?:1\.0|2\.0)\s*(?:이상|보장|확보)/gi,
      /(?:완벽|100%)\s*시력\s*(?:회복|교정)/gi,
      /(?:평생|영구)\s*시력\s*유지/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '시력 교정 목표와 개인차를 함께 안내하세요',
  },
  {
    id: 'OPHT-002',
    department: 'ophthalmology',
    name: '수술 부작용 부정',
    description: '눈 수술 부작용이 없다고 표현',
    patterns: [
      /(?:라식|라섹|렌즈삽입)\s*부작용\s*(?:없|제로)/gi,
      /(?:안구\s*건조|야간\s*눈부심)\s*(?:없|걱정\s*없)/gi,
      /(?:100%|완벽)\s*안전\s*(?:수술|시술)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제2호',
    suggestion: '수술 부작용 가능성과 관리 방법을 안내하세요',
  },

  // ========== 정형외과 ==========
  {
    id: 'ORTH-001',
    department: 'orthopedics',
    name: '관절/척추 완치 보장',
    description: '관절/척추 질환 완치를 보장',
    patterns: [
      /(?:디스크|척추|관절)\s*(?:완치|완전\s*치료)/gi,
      /(?:수술\s*없이|비수술)\s*(?:로\s*)?완치/gi,
      /(?:재발\s*없|평생)\s*(?:건강한?|튼튼한?)\s*(?:관절|척추)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '증상 관리 및 기능 개선으로 표현하세요',
  },
  {
    id: 'ORTH-002',
    department: 'orthopedics',
    name: '도수치료 효과 과장',
    description: '도수치료 효과를 과장',
    patterns: [
      /도수\s*(?:치료\s*)?(?:한\s*번|1회)\s*(?:로|에)\s*(?:완치|해결)/gi,
      /(?:즉각적|당일)\s*(?:효과|통증\s*해소)/gi,
      /(?:수술\s*대신|수술\s*없이)\s*(?:완치|완전\s*치료)/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '도수치료의 효과와 필요 횟수를 정확히 안내하세요',
  },

  // ========== 내과/일반 ==========
  {
    id: 'INTL-001',
    department: 'internal',
    name: '만성질환 완치 보장',
    description: '만성질환(당뇨, 고혈압) 완치를 보장',
    patterns: [
      /(?:당뇨|고혈압|고지혈증)\s*(?:완치|완전\s*치료)/gi,
      /(?:약\s*없이|약\s*끊고)\s*(?:완치|건강)/gi,
      /(?:만성\s*질환|성인병)\s*(?:완치|근본\s*치료)/gi,
    ],
    severity: 'critical',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '질환 관리 및 조절로 표현하세요',
  },
  {
    id: 'GENL-001',
    department: 'general',
    name: '검진 결과 보장',
    description: '건강검진으로 특정 결과를 보장',
    patterns: [
      /(?:100%|모든)\s*(?:질환|암|질병)\s*(?:발견|진단)/gi,
      /(?:완벽|완전)\s*(?:건강\s*)?검진/gi,
      /(?:놓치는|빠지는)\s*(?:것\s*)?없는?\s*검진/gi,
    ],
    severity: 'major',
    legalBasis: '의료법 제56조 제2항 제3호',
    suggestion: '검진의 한계와 정기 검진의 중요성을 함께 안내하세요',
  },
];

// ============================================
// 진료과목별 규칙 엔진 클래스
// ============================================

export class DepartmentRuleEngine {
  private rules: DepartmentRule[];

  constructor(customRules?: DepartmentRule[]) {
    this.rules = customRules || DEPARTMENT_RULES;
  }

  /**
   * 텍스트에서 진료과목 감지
   */
  detectDepartment(text: string): DepartmentDetectionResult {
    const scores = new Map<DepartmentType, number>();
    const evidence = new Map<DepartmentType, string[]>();

    for (const dept of DEPARTMENT_PATTERNS) {
      let score = 0;
      const deptEvidence: string[] = [];

      // 패턴 매칭 점수
      for (const pattern of dept.patterns) {
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) {
          score += matches.length * 2;
          deptEvidence.push(...matches.slice(0, 3));
        }
      }

      // 키워드 매칭 점수
      for (const keyword of dept.keywords) {
        if (text.includes(keyword)) {
          score += 1;
          if (!deptEvidence.includes(keyword)) {
            deptEvidence.push(keyword);
          }
        }
      }

      scores.set(dept.department, score);
      evidence.set(dept.department, deptEvidence);
    }

    // 최고 점수 진료과목 선택
    let maxScore = 0;
    let detectedDept: DepartmentType = 'general';

    for (const [dept, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        detectedDept = dept;
      }
    }

    // 신뢰도 계산 (최대 0.95)
    const confidence = Math.min(0.95, maxScore * 0.1);

    return {
      department: detectedDept,
      confidence,
      evidence: evidence.get(detectedDept) || [],
    };
  }

  /**
   * 특정 진료과목 규칙으로 검사
   */
  checkWithDepartment(text: string, department: DepartmentType): DepartmentViolation[] {
    const violations: DepartmentViolation[] = [];
    const departmentRules = this.rules.filter(r => r.department === department);

    for (const rule of departmentRules) {
      const violation = this.evaluateRule(text, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * 자동 감지 후 검사
   */
  checkWithAutoDetection(text: string): {
    detection: DepartmentDetectionResult;
    violations: DepartmentViolation[];
  } {
    const detection = this.detectDepartment(text);
    const violations = this.checkWithDepartment(text, detection.department);

    // 일반 규칙도 함께 검사
    if (detection.department !== 'general') {
      const generalViolations = this.checkWithDepartment(text, 'general');
      violations.push(...generalViolations);
    }

    return { detection, violations };
  }

  /**
   * 모든 진료과목 규칙으로 검사
   */
  checkAll(text: string): DepartmentViolation[] {
    const violations: DepartmentViolation[] = [];

    for (const rule of this.rules) {
      const violation = this.evaluateRule(text, rule);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * 규칙 평가
   */
  private evaluateRule(text: string, rule: DepartmentRule): DepartmentViolation | null {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);

      if (match) {
        // 예외 패턴 확인
        if (rule.exceptions) {
          const isException = rule.exceptions.some(ex => {
            ex.lastIndex = 0;
            return ex.test(text);
          });
          if (isException) continue;
        }

        const matchedText = match[0];
        const position = match.index;
        const endPosition = position + matchedText.length;

        // 컨텍스트 추출
        const contextStart = Math.max(0, position - 50);
        const contextEnd = Math.min(text.length, endPosition + 50);
        let context = text.slice(contextStart, contextEnd);
        if (contextStart > 0) context = '...' + context;
        if (contextEnd < text.length) context = context + '...';

        // 신뢰도 계산
        const confidence = this.calculateConfidence(rule, matchedText);

        return {
          ruleId: rule.id,
          department: rule.department,
          ruleName: rule.name,
          matchedText,
          context,
          position,
          endPosition,
          severity: rule.severity,
          legalBasis: rule.legalBasis,
          description: rule.description,
          suggestion: rule.suggestion,
          confidence,
        };
      }
    }

    return null;
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(rule: DepartmentRule, matchedText: string): number {
    let base = 0.7;

    // 심각도에 따른 가중치
    if (rule.severity === 'critical') base += 0.15;
    else if (rule.severity === 'major') base += 0.1;

    // 매칭 길이에 따른 가중치
    if (matchedText.length > 10) base += 0.05;

    return Math.min(0.95, base);
  }

  /**
   * 규칙 목록 조회
   */
  getRules(): DepartmentRule[] {
    return this.rules;
  }

  /**
   * 진료과목별 규칙 조회
   */
  getRulesByDepartment(department: DepartmentType): DepartmentRule[] {
    return this.rules.filter(r => r.department === department);
  }

  /**
   * 진료과목 목록 조회
   */
  getDepartments(): DepartmentType[] {
    return [...new Set(this.rules.map(r => r.department))];
  }

  /**
   * 진료과목 한글명 변환
   */
  getDepartmentName(department: DepartmentType): string {
    const names: Record<DepartmentType, string> = {
      dermatology: '피부과',
      plastic_surgery: '성형외과',
      dental: '치과',
      oriental: '한의원',
      psychiatry: '정신건강의학과',
      ophthalmology: '안과',
      orthopedics: '정형외과',
      internal: '내과',
      general: '일반/기타',
    };
    return names[department];
  }
}

// 싱글톤 인스턴스
export const departmentRuleEngine = new DepartmentRuleEngine();

// 팩토리 함수
export function createDepartmentRuleEngine(customRules?: DepartmentRule[]): DepartmentRuleEngine {
  return new DepartmentRuleEngine(customRules);
}
