/**
 * Viral MedCheck - 온라인 마케팅 현황 분석기
 * 병원의 온라인 마케팅 활동을 수집하고 점수화
 */

// ─── Types ───

export interface ViralItem {
  name: string;
  score: number;
  maxScore: number;
  evidence: string;
  recommendation: string;
}

export interface ViralAnalysisResult {
  totalScore: number;
  maxScore: 100;
  blogCount: number;
  cafeCount: number;
  sponsoredRatio: number;
  estimatedAdSpend: number;
  snsChannels: SnsChannel[];
  marketingFrequency: number;
  items: ViralItem[];
  recommendations: string[];
  analyzedUrl: string;
}

export interface SnsChannel {
  platform: string;
  url: string;
  detected: boolean;
}

// ─── Main Analyzer ───

export async function analyzeViral(
  hospitalName: string,
  url: string,
  htmlContent: string,
): Promise<ViralAnalysisResult> {
  const text = stripHtml(htmlContent);
  const lowerHtml = htmlContent.toLowerCase();

  const items: ViralItem[] = [];

  // 1. SNS 채널 보유 (20점)
  const snsChannels = detectSnsChannels(htmlContent, lowerHtml);
  {
    const activeChannels = snsChannels.filter(c => c.detected);
    let score = 0;
    if (activeChannels.length >= 4) score = 20;
    else if (activeChannels.length >= 3) score = 15;
    else if (activeChannels.length >= 2) score = 10;
    else if (activeChannels.length >= 1) score = 5;

    items.push({
      name: 'SNS 채널 보유',
      score,
      maxScore: 20,
      evidence: activeChannels.length > 0
        ? `발견된 채널: ${activeChannels.map(c => c.platform).join(', ')}`
        : 'SNS 채널 미발견',
      recommendation: score < 15
        ? '인스타그램, 유튜브, 블로그, 카카오 공식 채널을 운영하고 홈페이지에 링크하세요.'
        : '',
    });
  }

  // 2. 블로그/콘텐츠 마케팅 활동 (20점)
  const blogActivity = analyzeContentMarketing(htmlContent, text, lowerHtml);
  items.push(blogActivity.item);
  const blogCount = blogActivity.blogCount;

  // 3. 체험단/협찬 비율 (15점 - 낮을수록 좋음)
  const sponsoredResult = analyzeSponsoredContent(text);
  items.push(sponsoredResult.item);
  const sponsoredRatio = sponsoredResult.ratio;

  // 4. 키워드 전략 (15점)
  const keywordResult = analyzeKeywordStrategy(text, hospitalName);
  items.push(keywordResult);

  // 5. 이벤트/프로모션 활동 (15점)
  const eventResult = analyzeEventActivity(text, lowerHtml);
  items.push(eventResult);

  // 6. 마케팅 활동 빈도 (15점)
  const frequencyResult = analyzeMarketingFrequency(text, htmlContent);
  items.push(frequencyResult.item);

  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  const recommendations = generateViralRecommendations(items);

  // 광고비 추정 (간접 지표 기반)
  const estimatedAdSpend = estimateAdSpend(blogCount, snsChannels, totalScore);

  return {
    totalScore,
    maxScore: 100,
    blogCount,
    cafeCount: 0, // Workers에서 네이버 카페 검색 불가, 별도 크롤러 필요
    sponsoredRatio,
    estimatedAdSpend,
    snsChannels,
    marketingFrequency: frequencyResult.frequency,
    items,
    recommendations,
    analyzedUrl: url,
  };
}

// ─── SNS Channel Detection ───

function detectSnsChannels(html: string, lowerHtml: string): SnsChannel[] {
  const channels: SnsChannel[] = [];

  // Instagram
  const instaMatch = html.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i);
  channels.push({
    platform: 'Instagram',
    url: instaMatch ? `https://instagram.com/${instaMatch[1]}` : '',
    detected: !!instaMatch || lowerHtml.includes('instagram'),
  });

  // YouTube
  const ytMatch = html.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)([a-zA-Z0-9_-]+)/i);
  channels.push({
    platform: 'YouTube',
    url: ytMatch ? ytMatch[0] : '',
    detected: !!ytMatch || lowerHtml.includes('youtube.com'),
  });

  // Naver Blog
  const blogMatch = html.match(/(?:https?:\/\/)?blog\.naver\.com\/([a-zA-Z0-9_]+)/i);
  channels.push({
    platform: 'Naver Blog',
    url: blogMatch ? `https://blog.naver.com/${blogMatch[1]}` : '',
    detected: !!blogMatch || lowerHtml.includes('blog.naver.com'),
  });

  // KakaoTalk Channel
  const kakaoMatch = html.match(/(?:https?:\/\/)?(?:pf\.)?kakao(?:\.com|talk)/i);
  channels.push({
    platform: 'KakaoTalk',
    url: kakaoMatch ? kakaoMatch[0] : '',
    detected: !!kakaoMatch || lowerHtml.includes('kakao'),
  });

  // Facebook
  const fbMatch = html.match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)/i);
  channels.push({
    platform: 'Facebook',
    url: fbMatch ? `https://facebook.com/${fbMatch[1]}` : '',
    detected: !!fbMatch,
  });

  // TikTok
  const tiktokMatch = html.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
  channels.push({
    platform: 'TikTok',
    url: tiktokMatch ? `https://tiktok.com/@${tiktokMatch[1]}` : '',
    detected: !!tiktokMatch,
  });

  return channels;
}

// ─── Content Marketing Analysis ───

function analyzeContentMarketing(html: string, text: string, lowerHtml: string): {
  item: ViralItem;
  blogCount: number;
} {
  let score = 0;
  let evidence = '';

  // 블로그/뉴스 콘텐츠 개수 추정
  const blogIndicators = [
    ...((text.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}/g) || []).length > 0 ? ['날짜 항목'] : []),
    ...(lowerHtml.includes('blog') ? ['블로그 링크'] : []),
    ...(text.match(/(?:게시물|포스트|칼럼|뉴스|소식|공지)/g) || []),
  ];

  // 게시물 패턴 (날짜 + 제목)
  const postPatterns = text.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}\s+.{5,50}/g) || [];
  const blogCount = postPatterns.length;

  // 의학/시술 관련 정보성 콘텐츠
  const educationalContent = text.match(/(?:시술\s*(?:후기|정보|안내)|치료\s*(?:과정|사례)|의학\s*(?:칼럼|정보))/g) || [];

  if (blogCount >= 10) { score += 10; evidence += `게시물 ${blogCount}건. `; }
  else if (blogCount >= 5) { score += 7; evidence += `게시물 ${blogCount}건. `; }
  else if (blogCount >= 1) { score += 3; evidence += `게시물 ${blogCount}건. `; }

  if (educationalContent.length >= 3) { score += 5; evidence += `정보성 콘텐츠 ${educationalContent.length}건. `; }
  else if (educationalContent.length >= 1) { score += 3; evidence += `정보성 콘텐츠 ${educationalContent.length}건. `; }

  if (lowerHtml.includes('blog') || lowerHtml.includes('뉴스') || lowerHtml.includes('칼럼')) {
    score += 5;
    evidence += '블로그/뉴스 섹션 있음.';
  }

  if (!evidence) evidence = '콘텐츠 마케팅 활동 미발견';

  return {
    item: {
      name: '블로그/콘텐츠 마케팅',
      score: Math.min(score, 20),
      maxScore: 20,
      evidence: evidence.trim(),
      recommendation: score < 12 ? '블로그를 통해 시술 정보, 의학 칼럼, 환자 가이드 등 정보성 콘텐츠를 주기적으로 발행하세요.' : '',
    },
    blogCount,
  };
}

// ─── Sponsored Content Analysis ───

function analyzeSponsoredContent(text: string): {
  item: ViralItem;
  ratio: number;
} {
  const sponsoredKeywords = ['체험단', '협찬', '제공', '지원받', '광고', '원고료', '소정의', '무상'];
  const organicKeywords = ['후기', '리뷰', '방문', '경험', '솔직', '실제', '직접'];

  const sponsoredCount = sponsoredKeywords.reduce((sum, k) => {
    return sum + (text.match(new RegExp(k, 'g')) || []).length;
  }, 0);

  const organicCount = organicKeywords.reduce((sum, k) => {
    return sum + (text.match(new RegExp(k, 'g')) || []).length;
  }, 0);

  const total = sponsoredCount + organicCount;
  const ratio = total > 0 ? sponsoredCount / total : 0;

  // 낮은 비율이 좋음 (자연스러운 마케팅)
  let score = 0;
  let evidence = '';

  if (total === 0) {
    score = 8;
    evidence = '체험단/협찬 관련 키워드 미발견';
  } else if (ratio <= 0.2) {
    score = 15;
    evidence = `체험단/협찬 비율 ${(ratio * 100).toFixed(0)}% (건전한 수준)`;
  } else if (ratio <= 0.4) {
    score = 10;
    evidence = `체험단/협찬 비율 ${(ratio * 100).toFixed(0)}% (주의 필요)`;
  } else if (ratio <= 0.6) {
    score = 5;
    evidence = `체험단/협찬 비율 ${(ratio * 100).toFixed(0)}% (과다)`;
  } else {
    score = 2;
    evidence = `체험단/협찬 비율 ${(ratio * 100).toFixed(0)}% (의존도 높음)`;
  }

  return {
    item: {
      name: '체험단/협찬 비율',
      score,
      maxScore: 15,
      evidence,
      recommendation: score < 10 ? '자연스러운 환자 후기와 정보성 콘텐츠 비중을 높이고, 체험단 의존도를 줄이세요.' : '',
    },
    ratio,
  };
}

// ─── Keyword Strategy Analysis ───

function analyzeKeywordStrategy(text: string, hospitalName: string): ViralItem {
  let score = 0;
  let evidence = '';

  // 시술 키워드
  const treatmentKeywords = [
    '보톡스', '필러', '리프팅', '레이저', '지방흡입', '코성형', '눈성형',
    '여드름', '기미', '제모', '임플란트', '교정', '화이트닝', '탈모',
  ];
  const foundTreatments = treatmentKeywords.filter(k => text.includes(k));

  // 지역 키워드
  const locationKeywords = [
    '강남', '서초', '압구정', '신사', '홍대', '마포', '잠실', '송파',
    '분당', '판교', '해운대', '서면', '역삼', '청담', '동탄',
  ];
  const foundLocations = locationKeywords.filter(k => text.includes(k));

  // 시술+지역 조합
  if (foundTreatments.length >= 5 && foundLocations.length >= 2) {
    score = 15;
    evidence = `시술 키워드 ${foundTreatments.length}종, 지역 키워드 ${foundLocations.length}종 - 키워드 전략 우수`;
  } else if (foundTreatments.length >= 3 && foundLocations.length >= 1) {
    score = 10;
    evidence = `시술 키워드 ${foundTreatments.length}종, 지역 키워드 ${foundLocations.length}종`;
  } else if (foundTreatments.length >= 1) {
    score = 5;
    evidence = `시술 키워드 ${foundTreatments.length}종 (지역 키워드 부족)`;
  } else {
    evidence = '시술/지역 키워드 미발견';
  }

  return {
    name: '키워드 전략',
    score,
    maxScore: 15,
    evidence,
    recommendation: score < 10 ? '"강남 보톡스", "역삼 피부과" 등 지역+시술 키워드를 콘텐츠에 적극 활용하세요.' : '',
  };
}

// ─── Event Activity Analysis ───

function analyzeEventActivity(text: string, lowerHtml: string): ViralItem {
  let score = 0;
  let evidence = '';

  const eventKeywords = ['이벤트', '프로모션', '할인', '특가', '무료상담', '오픈기념', '신규', '론칭'];
  const foundEvents = eventKeywords.filter(k => text.includes(k));

  // 시즌/기간 한정 이벤트
  const seasonalKeywords = ['여름', '겨울', '설날', '추석', '발렌타인', '수능', '크리스마스', '연말'];
  const foundSeasonal = seasonalKeywords.filter(k => text.includes(k));

  if (foundEvents.length >= 4) { score += 10; evidence += `이벤트 키워드 ${foundEvents.length}종. `; }
  else if (foundEvents.length >= 2) { score += 7; evidence += `이벤트 키워드 ${foundEvents.length}종. `; }
  else if (foundEvents.length >= 1) { score += 3; evidence += `이벤트 키워드 ${foundEvents.length}종. `; }

  if (foundSeasonal.length >= 1) {
    score += 5;
    evidence += `시즌 이벤트: ${foundSeasonal.join(', ')}`;
  }

  if (!evidence) evidence = '이벤트/프로모션 활동 미발견';

  return {
    name: '이벤트/프로모션 활동',
    score: Math.min(score, 15),
    maxScore: 15,
    evidence: evidence.trim(),
    recommendation: score < 8 ? '시즌별 이벤트, 신규 시술 론칭 이벤트 등 프로모션 활동을 활성화하세요.' : '',
  };
}

// ─── Marketing Frequency Analysis ───

function analyzeMarketingFrequency(text: string, html: string): {
  item: ViralItem;
  frequency: number;
} {
  let score = 0;
  let evidence = '';

  // 최근 1개월 게시물 추정 (날짜 기반)
  const datePattern = /20\d{2}[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])/g;
  const dates = [...text.matchAll(datePattern)].map(m => {
    const [full] = m;
    return new Date(full.replace(/[./]/g, '-'));
  });

  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentDates = dates.filter(d => d >= oneMonthAgo && d <= now);
  const frequency = recentDates.length;

  if (frequency >= 10) {
    score = 15;
    evidence = `최근 1개월 게시물 ${frequency}건 - 매우 활발`;
  } else if (frequency >= 5) {
    score = 10;
    evidence = `최근 1개월 게시물 ${frequency}건 - 활발`;
  } else if (frequency >= 2) {
    score = 5;
    evidence = `최근 1개월 게시물 ${frequency}건 - 보통`;
  } else if (frequency >= 1) {
    score = 2;
    evidence = `최근 1개월 게시물 ${frequency}건 - 저조`;
  } else {
    evidence = '최근 1개월 내 마케팅 활동 미발견';
  }

  return {
    item: {
      name: '마케팅 활동 빈도',
      score,
      maxScore: 15,
      evidence,
      recommendation: score < 8 ? '최소 주 2회 이상 블로그 포스팅, SNS 업데이트 등 꾸준한 마케팅 활동을 유지하세요.' : '',
    },
    frequency,
  };
}

// ─── Ad Spend Estimation ───

function estimateAdSpend(
  blogCount: number,
  snsChannels: SnsChannel[],
  totalScore: number,
): number {
  // 간접 지표 기반 월 광고비 추정 (원)
  let estimate = 0;

  // 블로그 바이럴 당 약 5만원
  estimate += blogCount * 50000;

  // SNS 채널 운영비 (채널당 약 30만원/월)
  const activeChannels = snsChannels.filter(c => c.detected).length;
  estimate += activeChannels * 300000;

  // 총점 기반 보정 (활발한 마케팅 = 높은 예산)
  if (totalScore >= 70) estimate *= 1.5;
  else if (totalScore >= 50) estimate *= 1.2;

  return Math.round(estimate / 10000) * 10000; // 만원 단위 반올림
}

// ─── Recommendations ───

function generateViralRecommendations(items: ViralItem[]): string[] {
  const recs: string[] = [];

  const sorted = [...items].sort((a, b) => (a.score / a.maxScore) - (b.score / b.maxScore));

  for (const item of sorted) {
    if (item.recommendation && item.score < item.maxScore * 0.5) {
      recs.push(item.recommendation);
    }
    if (recs.length >= 5) break;
  }

  return recs;
}

// ─── Helpers ───

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
