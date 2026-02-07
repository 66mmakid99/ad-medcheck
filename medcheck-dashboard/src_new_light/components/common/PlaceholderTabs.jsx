// 설정 탭
export function SettingsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h4 className="text-slate-800 font-bold mb-4">계정 설정</h4>
        <div className="space-y-4">
          <InputField label="이름" defaultValue="테스트 사용자" />
          <InputField label="병원명" defaultValue="테스트 병원" />
          <InputField label="이메일" defaultValue="test@hospital.com" type="email" />
        </div>
        <button className="mt-6 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-200">
          저장
        </button>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h4 className="text-slate-800 font-bold mb-4">알림 설정</h4>
        <div className="space-y-3">
          {[
            { label: '이메일 알림', desc: '분석 결과를 이메일로 받기', checked: true },
            { label: '심각한 위반 즉시 알림', desc: '심각한 위반 발견 시 즉시 알림', checked: false },
            { label: '주간 리포트', desc: '매주 월요일 요약 리포트 발송', checked: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="text-slate-800 font-medium">{item.label}</p>
                <p className="text-slate-500 text-sm">{item.desc}</p>
              </div>
              <Toggle defaultChecked={item.checked} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 모니터링 탭 (준비중)
export function MonitoringTab() {
  return (
    <ComingSoon 
      icon="👁️"
      title="자동 모니터링"
      description="URL을 등록하면 자동으로 정기 분석을 수행합니다"
      features={['모니터링 URL 등록', '분석 주기 설정', '변경 감지 및 알림', '히스토리 타임라인']}
    />
  );
}

// 관리자: 고객 관리
export function CustomersTab() {
  const customers = [
    { name: '서울성형외과', contact: '김원장', plan: 'Pro', count: 156, status: '활성' },
    { name: '강남피부과', contact: '이과장', plan: 'Basic', count: 42, status: '활성' },
    { name: '부산치과', contact: '박원장', plan: 'Pro', count: 89, status: '만료' },
  ];
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-slate-800 font-bold">고객 목록</h4>
        <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-lg shadow-blue-200">
          + 고객 추가
        </button>
      </div>
      
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">병원명</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">담당자</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">요금제</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">분석 횟수</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={i} className={`${i % 2 === 1 ? 'bg-blue-50/50' : ''} hover:bg-blue-100/50 transition-colors`}>
                <td className="py-3 px-4 text-slate-800 font-medium">{c.name}</td>
                <td className="py-3 px-4 text-slate-600">{c.contact}</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    c.plan === 'Pro' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {c.plan}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">{c.count}회</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    c.status === '활성' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 관리자: 패턴 관리
export function PatternsTab() {
  const patterns = [
    { category: '최상급 표현', pattern: '최고|최상|최초|유일', count: 234 },
    { category: '비교 광고', pattern: '타 병원|다른 곳|비해', count: 156 },
    { category: '치료 보장', pattern: '100%|완치|보장|확실', count: 189 },
    { category: '가격 유인', pattern: '파격|이벤트|할인|특가', count: 312 },
  ];
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-slate-800 font-bold">위반 패턴 목록</h4>
        <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm shadow-lg shadow-blue-200">
          + 패턴 추가
        </button>
      </div>
      
      <div className="space-y-3">
        {patterns.map((p, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors">
            <div>
              <p className="text-slate-800 font-medium">{p.category}</p>
              <p className="text-slate-500 text-sm font-mono mt-1">{p.pattern}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate-400 text-sm">{p.count}회 탐지</span>
              <button className="text-blue-500 hover:text-blue-600 text-sm">수정</button>
              <button className="text-red-500 hover:text-red-600 text-sm">삭제</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 관리자: 오탐 관리
export function FalsePositivesTab() {
  const reports = [
    { text: '최고급 시설', category: '최상급 표현', status: '검토중', reporter: '서울성형외과' },
    { text: '100% 멸균 소독', category: '치료 보장', status: '승인됨', reporter: '강남피부과' },
    { text: '가장 편안한 진료', category: '최상급 표현', status: '반려됨', reporter: '부산치과' },
  ];
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h4 className="text-slate-800 font-bold mb-6">오탐 신고 목록</h4>
      
      <div className="space-y-3">
        {reports.map((f, i) => (
          <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-800 font-medium">"{f.text}"</p>
                <p className="text-slate-500 text-sm mt-1">{f.category} · {f.reporter}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                f.status === '검토중' ? 'bg-yellow-100 text-yellow-600' :
                f.status === '승인됨' ? 'bg-emerald-100 text-emerald-600' :
                'bg-red-100 text-red-600'
              }`}>
                {f.status}
              </span>
            </div>
            {f.status === '검토중' && (
              <div className="flex gap-2 mt-3">
                <button className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-lg">승인</button>
                <button className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg">반려</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 관리자: 크롤링 관리
export function CrawlingTab() {
  return (
    <ComingSoon 
      icon="🕷️"
      title="크롤링 관리"
      description="대규모 웹 크롤링 작업을 관리합니다"
      features={['크롤러 상태 모니터링', '스케줄 관리', '타겟 URL 관리', '로그 조회']}
    />
  );
}

// 공통 컴포넌트들
function InputField({ label, defaultValue, type = 'text' }) {
  return (
    <div>
      <label className="block text-slate-600 text-sm mb-2">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function Toggle({ defaultChecked }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500 shadow-inner"></div>
    </label>
  );
}

function ComingSoon({ icon, title, description, features }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h4 className="text-2xl font-bold text-slate-800 mb-2">{title}</h4>
      <p className="text-slate-500 mb-8">{description}</p>
      
      <div className="inline-block text-left bg-slate-50 border border-slate-200 rounded-xl p-6">
        <p className="text-slate-600 font-medium mb-3">예정된 기능:</p>
        <ul className="space-y-2">
          {features.map((f, i) => (
            <li key={i} className="text-slate-500 flex items-center gap-2">
              <span className="text-blue-500">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>
      
      <p className="text-slate-400 text-sm mt-8">🚧 Phase 2에서 개발 예정</p>
    </div>
  );
}
