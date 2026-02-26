/**
 * AEO/GEO 분석기 - AI 검색 노출 경쟁력 100점 만점 측정
 * 5카테고리 23항목 분석
 */

// ─── Types ───

export interface AeoItem {
  name: string;
  score: number;
  maxScore: number;
  evidence: string;
  recommendation: string;
}

export interface AeoCategory {
  score: number;
  maxScore: number;
  items: AeoItem[];
}

export interface AeoAnalysisResult {
  totalScore: number;
  categories: {
    content: AeoCategory;
    technical: AeoCategory;
    trust: AeoCategory;
    local: AeoCategory;
    aiFriendly: AeoCategory;
  };
  recommendations: string[];
  analyzedUrl: string;
}

// ─── Main Analyzer ───

export async function analyzeAeo(
  url: string,
  htmlContent: string,
): Promise<AeoAnalysisResult> {
  const text = stripHtml(htmlContent);
  const lowerHtml = htmlContent.toLowerCase();

  const content = analyzeContent(htmlContent, text, lowerHtml);
  const technical = analyzeTechnical(htmlContent, lowerHtml, url);
  const trust = analyzeTrust(htmlContent, text, lowerHtml);
  const local = analyzeLocal(htmlContent, text, lowerHtml);
  const aiFriendly = analyzeAiFriendly(htmlContent, text, lowerHtml);

  const totalScore = Math.round(
    (content.score + technical.score + trust.score + local.score + aiFriendly.score) * 10
  ) / 10;

  const recommendations = generateRecommendations(content, technical, trust, local, aiFriendly);

  return {
    totalScore,
    categories: { content, technical, trust, local, aiFriendly },
    recommendations,
    analyzedUrl: url,
  };
}

// ─── Category 1: 콘텐츠 품질 (30점) ───

function analyzeContent(html: string, text: string, lowerHtml: string): AeoCategory {
  const items: AeoItem[] = [];

  // 1. FAQ 존재 및 충실도 (6점)
  {
    let score = 0;
    let evidence = '';
    const hasFaqSchema = lowerHtml.includes('faqpage') || lowerHtml.includes('"@type":"faqpage"');
    const faqSectionMatch = html.match(/(?:faq|자주\s*묻는\s*질문|Q\s*&\s*A|질문과\s*답변)/gi);
    const qaPatterns = text.match(/(?:Q\.|Q\d|질문|Q:)[\s\S]*?(?:A\.|A\d|답변|A:)/g);
    const qaCount = qaPatterns ? qaPatterns.length : 0;

    if (hasFaqSchema) {
      score += 3;
      evidence += 'FAQPage Schema 감지. ';
    }
    if (faqSectionMatch && faqSectionMatch.length > 0) {
      score += 1;
      evidence += `FAQ 섹션 ${faqSectionMatch.length}개 감지. `;
    }
    if (qaCount >= 5) {
      score += 2;
      evidence += `Q&A ${qaCount}쌍.`;
    } else if (qaCount >= 2) {
      score += 1;
      evidence += `Q&A ${qaCount}쌍.`;
    } else {
      evidence += evidence ? '' : 'FAQ 미발견.';
    }
    items.push({
      name: 'FAQ 존재 및 충실도', score: Math.min(score, 6), maxScore: 6,
      evidence: evidence.trim(),
      recommendation: score < 4 ? 'FAQPage Schema.org 마크업과 함께 최소 5개 이상의 시술 관련 Q&A를 추가하세요.' : '',
    });
  }

  // 2. 시술별 전문 콘텐츠 (6점)
  {
    let score = 0;
    let evidence = '';
    const treatmentKeywords = [
      '보톡스', '필러', '리프팅', '레이저', '쁘띠', '지방흡입', '코성형',
      '눈성형', '가슴수술', '주름', '기미', '여드름', '피부과', '탈모',
      '치아교정', '임플란트', '라미네이트', '스케일링', '화이트닝', '모발이식',
    ];
    const foundTreatments = treatmentKeywords.filter(k => text.includes(k));
    const avgLength = text.length;

    if (foundTreatments.length >= 8) score += 3;
    else if (foundTreatments.length >= 4) score += 2;
    else if (foundTreatments.length >= 1) score += 1;

    if (avgLength >= 3000) score += 3;
    else if (avgLength >= 1500) score += 2;
    else if (avgLength >= 500) score += 1;

    evidence = `시술 키워드 ${foundTreatments.length}종 (${foundTreatments.slice(0, 5).join(', ')}${foundTreatments.length > 5 ? '...' : ''}), 텍스트 ${avgLength}자`;
    items.push({
      name: '시술별 전문 콘텐츠', score: Math.min(score, 6), maxScore: 6,
      evidence,
      recommendation: score < 4 ? '각 시술에 대한 개별 페이지를 만들고, 시술 설명을 500자 이상으로 작성하세요.' : '',
    });
  }

  // 3. 구조화된 정보 제공 (6점)
  {
    let score = 0;
    let evidence = '';
    const headings = html.match(/<h[1-6][^>]*>/gi) || [];
    const lists = html.match(/<(?:ul|ol)[^>]*>/gi) || [];
    const tables = html.match(/<table[^>]*>/gi) || [];

    if (headings.length >= 10) score += 2;
    else if (headings.length >= 3) score += 1;

    if (lists.length >= 5) score += 2;
    else if (lists.length >= 2) score += 1;

    if (tables.length >= 1) score += 1;

    // 목차/네비게이션 구조
    const hasNav = lowerHtml.includes('<nav') || lowerHtml.includes('목차') || lowerHtml.includes('table of contents');
    if (hasNav) score += 1;

    evidence = `제목 ${headings.length}개, 목록 ${lists.length}개, 표 ${tables.length}개${hasNav ? ', 네비게이션 있음' : ''}`;
    items.push({
      name: '구조화된 정보 제공', score: Math.min(score, 6), maxScore: 6,
      evidence,
      recommendation: score < 4 ? 'H2/H3 소제목, 불릿 목록, 가격 비교표 등을 활용하여 정보를 구조화하세요.' : '',
    });
  }

  // 4. 전문 용어 적절성 (4점)
  {
    let score = 0;
    let evidence = '';
    const medicalTerms = [
      '시술', '진료', '치료', '의사', '전문의', '마취', '수술', '회복',
      '부작용', '효과', '피부', '진단', '상담', '처방', '약물',
    ];
    const totalWords = text.length;
    const medCount = medicalTerms.reduce((sum, term) => {
      const matches = text.match(new RegExp(term, 'g'));
      return sum + (matches ? matches.length : 0);
    }, 0);
    const density = totalWords > 0 ? medCount / (totalWords / 100) : 0;

    // 적절 범위: 1~5% 밀도
    if (density >= 1 && density <= 5) {
      score = 4;
      evidence = `의학 용어 밀도 ${density.toFixed(1)}% (적절)`;
    } else if (density > 5) {
      score = 2;
      evidence = `의학 용어 밀도 ${density.toFixed(1)}% (과다 - 일반인 가독성 저하 우려)`;
    } else if (density >= 0.3) {
      score = 2;
      evidence = `의학 용어 밀도 ${density.toFixed(1)}% (부족)`;
    } else {
      score = 0;
      evidence = `의학 용어 밀도 ${density.toFixed(1)}% (매우 부족)`;
    }
    items.push({
      name: '전문 용어 적절성', score, maxScore: 4,
      evidence,
      recommendation: score < 3 ? '전문 용어와 쉬운 설명을 균형있게 사용하세요. "보톡스(보툴리눔 독소)"처럼 괄호 설명을 활용하세요.' : '',
    });
  }

  // 5. E-E-A-T 요소 (4점)
  {
    let score = 0;
    let evidence = '';
    const hasAuthor = /(?:작성자|저자|by|글쓴이|담당\s*(?:의사|의|교수))[:\s]/i.test(text);
    const hasDate = /(?:최종\s*수정|업데이트|수정일|작성일|게시일)[:\s]*\d{4}/i.test(text);
    const hasSource = /(?:출처|참고\s*문헌|참고자료|reference|source)[:\s]/i.test(text);
    const hasDoctorName = /(?:원장|대표원장|의사|전문의|교수)\s*[가-힣]{2,4}/g.test(text);

    if (hasAuthor || hasDoctorName) { score += 1; evidence += '저자(의사) 명시. '; }
    if (hasDate) { score += 1; evidence += '수정일 명시. '; }
    if (hasSource) { score += 1; evidence += '출처 명시. '; }
    if (score >= 2) score += 1; // 2개 이상이면 보너스
    if (!evidence) evidence = 'E-E-A-T 요소 미발견';

    items.push({
      name: 'E-E-A-T 요소', score: Math.min(score, 4), maxScore: 4,
      evidence: evidence.trim(),
      recommendation: score < 3 ? '각 콘텐츠에 작성 의사 이름, 최종 수정일, 참고 문헌을 표시하세요.' : '',
    });
  }

  // 6. 콘텐츠 신선도 (4점)
  {
    let score = 0;
    let evidence = '';
    const dateMatches = text.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/g) || [];
    const recentDates = dateMatches.filter(d => {
      const year = parseInt(d.substring(0, 4));
      return year >= 2025;
    });

    if (recentDates.length >= 5) {
      score = 4;
      evidence = `최근(2025+) 날짜 ${recentDates.length}건 발견 - 활발한 업데이트`;
    } else if (recentDates.length >= 2) {
      score = 3;
      evidence = `최근(2025+) 날짜 ${recentDates.length}건 발견`;
    } else if (dateMatches.length > 0) {
      score = 1;
      evidence = `날짜 ${dateMatches.length}건 발견하였으나 최근 업데이트 부족`;
    } else {
      evidence = '날짜 정보 미발견';
    }
    items.push({
      name: '콘텐츠 신선도', score, maxScore: 4,
      evidence,
      recommendation: score < 3 ? '블로그, 뉴스, 이벤트 등을 통해 주기적으로 콘텐츠를 업데이트하세요.' : '',
    });
  }

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  return { score: totalScore, maxScore: 30, items };
}

// ─── Category 2: 기술 기반 (20점) ───

function analyzeTechnical(html: string, lowerHtml: string, url: string): AeoCategory {
  const items: AeoItem[] = [];

  // 1. Schema.org 마크업 (6점)
  {
    let score = 0;
    let evidence = '';
    const hasJsonLd = lowerHtml.includes('<script type="application/ld+json"') || lowerHtml.includes("'application/ld+json'");
    const hasMicrodata = lowerHtml.includes('itemscope') || lowerHtml.includes('itemprop');
    const schemaTypes: string[] = [];

    if (hasJsonLd) {
      score += 3;
      evidence += 'JSON-LD 감지. ';
      const ldMatches = html.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
      for (const m of ldMatches) {
        const type = m.match(/"@type"\s*:\s*"([^"]+)"/)?.[1];
        if (type) schemaTypes.push(type);
      }
    }
    if (hasMicrodata) {
      score += 2;
      evidence += 'Microdata 감지. ';
    }
    if (schemaTypes.length > 0) {
      score += 1;
      evidence += `Schema 유형: ${schemaTypes.join(', ')}`;
    }
    if (!evidence) evidence = 'Schema.org 마크업 미발견';

    items.push({
      name: 'Schema.org 마크업', score: Math.min(score, 6), maxScore: 6,
      evidence: evidence.trim(),
      recommendation: score < 4 ? 'MedicalBusiness, FAQPage, MedicalProcedure 등 Schema.org JSON-LD를 추가하세요.' : '',
    });
  }

  // 2. 페이지 속도 (4점) - HTML 크기 기반 추정
  {
    let score = 0;
    let evidence = '';
    const htmlSize = html.length;
    const inlineScripts = (html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []).length;
    const inlineStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).length;
    const images = (html.match(/<img[^>]*>/gi) || []).length;
    const hasLazyLoad = lowerHtml.includes('loading="lazy"') || lowerHtml.includes('lazyload');

    if (htmlSize < 200000) score += 2;
    else if (htmlSize < 500000) score += 1;

    if (hasLazyLoad) { score += 1; evidence += '이미지 지연 로딩 적용. '; }
    if (inlineScripts < 10) { score += 1; }

    evidence += `HTML ${Math.round(htmlSize / 1024)}KB, 인라인 스크립트 ${inlineScripts}개, 이미지 ${images}개`;
    items.push({
      name: '페이지 속도 (추정)', score: Math.min(score, 4), maxScore: 4,
      evidence: evidence.trim(),
      recommendation: score < 3 ? '이미지 최적화, 코드 축소, CDN 사용 등으로 페이지 로딩 속도를 개선하세요.' : '',
    });
  }

  // 3. 모바일 최적화 (4점)
  {
    let score = 0;
    let evidence = '';
    const hasViewport = lowerHtml.includes('viewport');
    const hasResponsive = lowerHtml.includes('media') && lowerHtml.includes('max-width');
    const hasMetaMobile = lowerHtml.includes('mobile-web-app-capable') || lowerHtml.includes('apple-mobile-web-app');

    if (hasViewport) { score += 2; evidence += 'viewport 메타 태그 있음. '; }
    if (hasResponsive) { score += 1; evidence += '반응형 미디어쿼리 감지. '; }
    if (hasMetaMobile) { score += 1; evidence += '모바일 앱 메타 태그 있음. '; }
    if (!evidence) evidence = '모바일 최적화 요소 미발견';

    items.push({
      name: '모바일 최적화', score: Math.min(score, 4), maxScore: 4,
      evidence: evidence.trim(),
      recommendation: score < 3 ? 'viewport 메타 태그와 반응형 CSS를 적용하세요.' : '',
    });
  }

  // 4. HTTPS (2점)
  {
    const isHttps = url.startsWith('https://');
    items.push({
      name: 'HTTPS', score: isHttps ? 2 : 0, maxScore: 2,
      evidence: isHttps ? 'HTTPS 사용 중' : 'HTTP 사용 - 보안 취약',
      recommendation: isHttps ? '' : 'SSL 인증서를 설치하여 HTTPS로 전환하세요.',
    });
  }

  // 5. sitemap.xml (2점) - HTML 내 참조 확인
  {
    let score = 0;
    let evidence = '';
    const hasSitemapRef = lowerHtml.includes('sitemap') || lowerHtml.includes('sitemap.xml');
    if (hasSitemapRef) {
      score = 2;
      evidence = 'sitemap 참조 발견';
    } else {
      evidence = 'sitemap 참조 미발견 (별도 확인 필요)';
      score = 1; // 별도 확인 필요하므로 중립 점수
    }
    items.push({
      name: 'sitemap.xml', score, maxScore: 2,
      evidence,
      recommendation: score < 2 ? '/sitemap.xml을 생성하고 Google Search Console에 제출하세요.' : '',
    });
  }

  // 6. robots.txt (2점) - HTML 내 힌트 확인
  {
    let score = 1; // 별도 확인 필요하므로 중립 점수
    const evidence = 'robots.txt는 별도 URL 요청으로 확인 필요';
    items.push({
      name: 'robots.txt', score, maxScore: 2,
      evidence,
      recommendation: 'robots.txt가 AI 크롤러(GPTBot, ClaudeBot)를 차단하지 않는지 확인하세요.',
    });
  }

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  return { score: totalScore, maxScore: 20, items };
}

// ─── Category 3: 신뢰도 (20점) ───

function analyzeTrust(html: string, text: string, lowerHtml: string): AeoCategory {
  const items: AeoItem[] = [];

  // 1. 의사 프로필 상세도 (6점)
  {
    let score = 0;
    let evidence = '';
    const hasDoctorName = /(?:원장|대표원장|부원장|진료의|전문의|의사)\s*[가-힣]{2,4}/.test(text);
    const hasSpecialty = /전문의|전공|세부전공/.test(text);
    const hasCareer = /(?:경력|약력|이력|학력|출신)/.test(text);
    const hasEducation = /(?:대학|의과대학|의대|학사|석사|박사|수련)/.test(text);
    const hasDoctorPhoto = /(?:원장|의사|doctor|dr).*?(?:jpg|png|webp|gif)/i.test(html);

    if (hasDoctorName) { score += 2; evidence += '의사 이름 있음. '; }
    if (hasSpecialty) { score += 1; evidence += '전문의 자격 있음. '; }
    if (hasCareer || hasEducation) { score += 2; evidence += '경력/학력 있음. '; }
    if (hasDoctorPhoto) { score += 1; evidence += '의사 사진 있음. '; }
    if (!evidence) evidence = '의사 프로필 정보 미발견';

    items.push({
      name: '의사 프로필 상세도', score: Math.min(score, 6), maxScore: 6,
      evidence: evidence.trim(),
      recommendation: score < 4 ? '의사 이름, 전문의 자격, 경력, 학력, 사진을 상세히 기재하세요.' : '',
    });
  }

  // 2. 인증/자격 표시 (4점)
  {
    let score = 0;
    let evidence = '';
    const certKeywords = ['인증', '자격', '수상', '학회', '대한', '협회', '인정', '우수'];
    const found = certKeywords.filter(k => text.includes(k));

    if (found.length >= 4) score = 4;
    else if (found.length >= 2) score = 3;
    else if (found.length >= 1) score = 1;

    evidence = found.length > 0
      ? `인증/자격 키워드: ${found.join(', ')}`
      : '인증/자격 관련 표현 미발견';
    items.push({
      name: '인증/자격 표시', score, maxScore: 4,
      evidence,
      recommendation: score < 3 ? '병원 인증(JCI 등), 학회 인증, 수상 이력을 명시하세요.' : '',
    });
  }

  // 3. 학술 활동 (4점)
  {
    let score = 0;
    let evidence = '';
    const academicKeywords = ['논문', '학회', '발표', '연구', 'SCI', '학술', '저널', 'journal', '세미나', '강연'];
    const found = academicKeywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));

    if (found.length >= 3) score = 4;
    else if (found.length >= 2) score = 3;
    else if (found.length >= 1) score = 2;

    evidence = found.length > 0
      ? `학술 활동 키워드: ${found.join(', ')}`
      : '학술 활동 관련 표현 미발견';
    items.push({
      name: '학술 활동', score, maxScore: 4,
      evidence,
      recommendation: score < 3 ? '논문 목록, 학회 발표 이력, 학술 활동을 홈페이지에 기재하세요.' : '',
    });
  }

  // 4. 리뷰 연동 (3점)
  {
    let score = 0;
    let evidence = '';
    const hasNaverReview = lowerHtml.includes('place.naver') || lowerHtml.includes('naver.com/review') || text.includes('네이버 리뷰');
    const hasGoogleReview = lowerHtml.includes('google.com/maps') || text.includes('구글 리뷰') || text.includes('Google 리뷰');
    const hasReviewSection = /(?:후기|리뷰|review|체험기|만족도)/.test(text);

    if (hasNaverReview) { score += 1; evidence += '네이버 리뷰 연동. '; }
    if (hasGoogleReview) { score += 1; evidence += '구글 리뷰 연동. '; }
    if (hasReviewSection) { score += 1; evidence += '리뷰/후기 섹션 있음. '; }
    if (!evidence) evidence = '리뷰 연동 미발견';

    items.push({
      name: '리뷰 연동', score: Math.min(score, 3), maxScore: 3,
      evidence: evidence.trim(),
      recommendation: score < 2 ? '네이버/구글 리뷰 위젯 또는 링크를 추가하세요.' : '',
    });
  }

  // 5. 투명한 가격 정보 (3점)
  {
    let score = 0;
    let evidence = '';
    const pricePatterns = /(?:\d{1,3}[,.]?\d{3}\s*(?:원|₩|won)|비급여\s*(?:가격|진료비|수가)|가격\s*(?:표|안내|목록))/gi;
    const priceMatches = text.match(pricePatterns) || [];

    if (priceMatches.length >= 5) {
      score = 3;
      evidence = `가격 정보 ${priceMatches.length}건 - 투명한 공개`;
    } else if (priceMatches.length >= 2) {
      score = 2;
      evidence = `가격 정보 ${priceMatches.length}건 - 부분 공개`;
    } else if (priceMatches.length >= 1) {
      score = 1;
      evidence = `가격 정보 ${priceMatches.length}건 - 최소 공개`;
    } else {
      evidence = '가격 정보 미발견';
    }
    items.push({
      name: '투명한 가격 정보', score, maxScore: 3,
      evidence,
      recommendation: score < 2 ? '비급여 시술 가격표를 공개하여 투명성을 높이세요.' : '',
    });
  }

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  return { score: totalScore, maxScore: 20, items };
}

// ─── Category 4: 지역 최적화 (15점) ───

function analyzeLocal(html: string, text: string, lowerHtml: string): AeoCategory {
  const items: AeoItem[] = [];

  // 1. Google Business Profile (5점) - HTML 내 힌트
  {
    let score = 0;
    let evidence = '';
    const hasGoogleMap = lowerHtml.includes('google.com/maps') || lowerHtml.includes('maps.google');
    const hasGoogleEmbed = lowerHtml.includes('maps.googleapis.com') || lowerHtml.includes('google.com/maps/embed');

    if (hasGoogleEmbed) { score += 3; evidence += '구글 지도 임베드 있음. '; }
    else if (hasGoogleMap) { score += 2; evidence += '구글 지도 링크 있음. '; }

    // GBP 관련 추가 힌트
    const hasGBPHint = text.includes('구글 비즈니스') || text.includes('Google Business');
    if (hasGBPHint) { score += 2; evidence += 'GBP 언급 있음.'; }

    if (!evidence) {
      evidence = '구글 비즈니스 프로필 연동 미발견 (별도 확인 필요)';
      score = 1; // 별도 확인 필요
    }
    items.push({
      name: 'Google Business Profile', score: Math.min(score, 5), maxScore: 5,
      evidence: evidence.trim(),
      recommendation: score < 3 ? 'Google Business Profile을 등록하고 홈페이지에 구글 지도를 임베드하세요.' : '',
    });
  }

  // 2. 네이버 플레이스 (5점) - HTML 내 힌트
  {
    let score = 0;
    let evidence = '';
    const hasNaverMap = lowerHtml.includes('map.naver') || lowerHtml.includes('naver.com/map');
    const hasNaverPlace = lowerHtml.includes('place.naver') || lowerHtml.includes('naver.me');
    const hasNaverEmbed = lowerHtml.includes('openapi.naver.com/map') || lowerHtml.includes('navermaps');

    if (hasNaverPlace) { score += 3; evidence += '네이버 플레이스 링크 있음. '; }
    if (hasNaverEmbed || hasNaverMap) { score += 2; evidence += '네이버 지도 연동. '; }

    if (!evidence) {
      evidence = '네이버 플레이스 연동 미발견 (별도 확인 필요)';
      score = 1;
    }
    items.push({
      name: '네이버 플레이스', score: Math.min(score, 5), maxScore: 5,
      evidence: evidence.trim(),
      recommendation: score < 3 ? '네이버 플레이스를 등록하고 정보를 충실하게 입력하세요.' : '',
    });
  }

  // 3. NAP 일관성 (3점) - Name, Address, Phone
  {
    let score = 0;
    let evidence = '';
    const hasPhone = /(?:02|0\d{1,2})[-\s]?\d{3,4}[-\s]?\d{4}/.test(text);
    const hasAddress = /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|전라|경상|제주|강남|역삼|서초|송파|마포|종로)/.test(text);
    const hasName = /(?:의원|병원|클리닉|센터|피부과|성형외과|치과|정형외과|안과|한의원)/.test(text);

    if (hasName) { score += 1; evidence += '병원명 있음. '; }
    if (hasAddress) { score += 1; evidence += '주소 있음. '; }
    if (hasPhone) { score += 1; evidence += '전화번호 있음. '; }
    if (!evidence) evidence = 'NAP(이름/주소/전화) 정보 미발견';

    items.push({
      name: 'NAP 일관성', score: Math.min(score, 3), maxScore: 3,
      evidence: evidence.trim(),
      recommendation: score < 3 ? '병원 이름, 주소, 전화번호를 홈페이지 하단에 명확히 기재하세요.' : '',
    });
  }

  // 4. 지역 키워드 (2점)
  {
    let score = 0;
    let evidence = '';
    const localKeywords = [
      '강남', '서초', '역삼', '압구정', '신사', '청담', '삼성', '논현',
      '홍대', '마포', '이태원', '용산', '종로', '을지로', '명동',
      '잠실', '송파', '강동', '분당', '판교', '동탄', '수원',
      '해운대', '서면', '센텀', '연산', '대연',
    ];
    const treatments = ['피부과', '성형외과', '치과', '보톡스', '필러', '리프팅', '임플란트'];
    const foundLocal = localKeywords.filter(k => text.includes(k));
    const foundTreatment = treatments.filter(k => text.includes(k));

    // 지역+시술 조합이 있으면 높은 점수
    if (foundLocal.length > 0 && foundTreatment.length > 0) {
      score = 2;
      evidence = `지역 키워드: ${foundLocal.slice(0, 3).join(', ')}, 시술: ${foundTreatment.slice(0, 3).join(', ')}`;
    } else if (foundLocal.length > 0) {
      score = 1;
      evidence = `지역 키워드: ${foundLocal.slice(0, 3).join(', ')} (시술 조합 미발견)`;
    } else {
      evidence = '지역+시술 키워드 조합 미발견';
    }
    items.push({
      name: '지역 키워드', score, maxScore: 2,
      evidence,
      recommendation: score < 2 ? '"강남 피부과", "역삼역 보톡스" 등 지역+시술 키워드를 콘텐츠에 포함하세요.' : '',
    });
  }

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  return { score: totalScore, maxScore: 15, items };
}

// ─── Category 5: AI 친화성 (15점) ───

function analyzeAiFriendly(html: string, text: string, lowerHtml: string): AeoCategory {
  const items: AeoItem[] = [];

  // 1. AI 크롤러 접근 허용 (5점) - robots.txt 힌트 + meta robots
  {
    let score = 0;
    let evidence = '';
    const hasNoindex = lowerHtml.includes('noindex') || lowerHtml.includes('nofollow');
    const hasMetaRobots = /<meta[^>]*name=["']robots["'][^>]*>/i.test(html);

    if (hasNoindex) {
      score = 0;
      evidence = 'noindex/nofollow 감지 - AI 크롤러 접근 차단 가능';
    } else if (hasMetaRobots) {
      score = 3;
      evidence = 'robots meta 태그 존재 (차단 없음)';
    } else {
      score = 3; // meta robots 없으면 기본 허용
      evidence = 'robots 차단 없음 (robots.txt는 별도 확인 필요)';
    }
    items.push({
      name: 'AI 크롤러 접근 허용', score: Math.min(score, 5), maxScore: 5,
      evidence,
      recommendation: score < 3 ? 'robots.txt에서 GPTBot, ClaudeBot, GoogleOther 등 AI 크롤러를 허용하세요.' : '',
    });
  }

  // 2. 인용 가능한 콘텐츠 (5점)
  {
    let score = 0;
    let evidence = '';
    // 숫자/통계가 포함된 문장
    const factSentences = text.match(/[^.!?]*\d+[%명건회년개원만]\s*[^.!?]*/g) || [];
    // 비교 표현
    const comparisons = text.match(/[^.!?]*(?:보다|대비|비교|차이|vs)[^.!?]*/g) || [];
    // 목록형 정보
    const listItems = (html.match(/<li[^>]*>/gi) || []).length;

    if (factSentences.length >= 5) score += 2;
    else if (factSentences.length >= 2) score += 1;

    if (comparisons.length >= 2) score += 1;
    if (listItems >= 10) score += 2;
    else if (listItems >= 5) score += 1;

    evidence = `팩트 문장 ${factSentences.length}개, 비교 표현 ${comparisons.length}개, 목록 항목 ${listItems}개`;
    items.push({
      name: '인용 가능한 콘텐츠', score: Math.min(score, 5), maxScore: 5,
      evidence,
      recommendation: score < 3 ? '구체적인 숫자, 통계, 비교 데이터가 포함된 명확한 팩트 문장을 추가하세요.' : '',
    });
  }

  // 3. 답변 적합 구조 (5점)
  {
    let score = 0;
    let evidence = '';
    // 질문-답변 형식
    const qaFormat = text.match(/(?:Q[.:]|질문|궁금)[\s\S]*?(?:A[.:]|답변|답\s*:)/g) || [];
    // 요약문
    const hasSummary = /(?:요약|정리|결론|핵심|한눈에)/.test(text);
    // 목록형 정보 (번호 매김)
    const numberedList = text.match(/\d+\.\s+[가-힣]/g) || [];

    if (qaFormat.length >= 3) { score += 2; evidence += `Q&A 형식 ${qaFormat.length}쌍. `; }
    else if (qaFormat.length >= 1) { score += 1; evidence += `Q&A 형식 ${qaFormat.length}쌍. `; }

    if (hasSummary) { score += 1; evidence += '요약 섹션 있음. '; }
    if (numberedList.length >= 3) { score += 2; evidence += `번호 목록 ${numberedList.length}건. `; }
    else if (numberedList.length >= 1) { score += 1; evidence += `번호 목록 ${numberedList.length}건. `; }

    if (!evidence) evidence = '답변 적합 구조(Q&A, 요약, 번호목록) 미발견';
    items.push({
      name: '답변 적합 구조', score: Math.min(score, 5), maxScore: 5,
      evidence: evidence.trim(),
      recommendation: score < 3 ? '질문-답변 형식, 번호 목록, 요약문 등 AI가 인용하기 좋은 구조로 작성하세요.' : '',
    });
  }

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  return { score: totalScore, maxScore: 15, items };
}

// ─── Helpers ───

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateRecommendations(
  content: AeoCategory,
  technical: AeoCategory,
  trust: AeoCategory,
  local: AeoCategory,
  aiFriendly: AeoCategory,
): string[] {
  const recs: string[] = [];

  // 가장 점수가 낮은 카테고리 순으로 추천
  const cats = [
    { name: '콘텐츠 품질', cat: content, ratio: content.score / content.maxScore },
    { name: '기술 기반', cat: technical, ratio: technical.score / technical.maxScore },
    { name: '신뢰도', cat: trust, ratio: trust.score / trust.maxScore },
    { name: '지역 최적화', cat: local, ratio: local.score / local.maxScore },
    { name: 'AI 친화성', cat: aiFriendly, ratio: aiFriendly.score / aiFriendly.maxScore },
  ].sort((a, b) => a.ratio - b.ratio);

  for (const c of cats) {
    if (c.ratio < 0.5) {
      recs.push(`[${c.name}] 개선 시급 (${Math.round(c.ratio * 100)}%)`);
    }
    for (const item of c.cat.items) {
      if (item.recommendation && item.score < item.maxScore * 0.5) {
        recs.push(item.recommendation);
      }
    }
    if (recs.length >= 5) break; // 최대 5개 추천
  }

  return recs.slice(0, 5);
}
