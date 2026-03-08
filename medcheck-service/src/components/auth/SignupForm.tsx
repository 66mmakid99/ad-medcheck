import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

type SignupRoute = 'select' | 'doctor';

export default function SignupForm() {
  const [route, setRoute] = useState<SignupRoute>('select');

  if (route === 'doctor') {
    return <DoctorSignupForm onBack={() => setRoute('select')} />;
  }

  return <SignupRouteSelector onSelect={setRoute} />;
}

// ─── 경로 선택 ────────────────────────────────────────────────────
function SignupRouteSelector({ onSelect }: { onSelect: (r: SignupRoute) => void }) {
  return (
    <div className="w-full auth-slide-up">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center justify-center mb-8">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-sm shadow-sm">M</div>
          <span className="text-lg font-bold text-text-primary">MADMEDCHECK</span>
        </a>
      </div>

      <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-md border border-border/60">
        {/* Header */}
        <div className="text-center mb-8 auth-slide-up auth-slide-up-delay-1">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">MADMEDCHECK 가입</h1>
          <p className="text-sm text-text-secondary mt-2">의료인 인증 기반 광고 분석 서비스</p>
        </div>

        {/* Route selection */}
        <div className="space-y-3">
          <button
            onClick={() => onSelect('doctor')}
            className="auth-slide-up auth-slide-up-delay-2 w-full p-5 bg-white border border-gray-200 rounded-xl text-left hover:border-accent/40 hover:shadow-md transition-all duration-200 group"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors">의사 / 원장</h3>
                <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                  의사면허증으로 본인 인증 후 병원 조직을 생성합니다.
                  원장님이 직접 가입하는 경로입니다.
                </p>
              </div>
              <svg className="w-5 h-5 text-text-muted group-hover:text-accent shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Invite divider */}
          <div className="auth-divider my-5 text-xs text-text-muted font-medium">초대를 받으셨나요?</div>

          <a
            href="/auth/invite"
            className="auth-slide-up auth-slide-up-delay-3 block w-full p-4 bg-white border border-gray-200 rounded-xl text-center hover:border-accent/40 hover:shadow-sm transition-all duration-200"
          >
            <span className="text-sm font-medium text-text-secondary hover:text-accent transition-colors">
              초대 링크로 가입하기
              <svg className="w-4 h-4 inline ml-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </a>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-text-secondary mt-8">
          이미 계정이 있으신가요?{' '}
          <a href="/auth/login" className="text-accent font-semibold hover:text-accent-light transition-colors">로그인</a>
        </p>
      </div>
    </div>
  );
}

// ─── 의사/원장 가입 ───────────────────────────────────────────────
function DoctorSignupForm({ onBack }: { onBack: () => void }) {
  const { signUp } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactName, setContactName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, {
        hospital_name: hospitalName,
        contact_name: contactName,
        signup_path: 'doctor',
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message ?? '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full auth-slide-up">
        <div className="bg-white rounded-2xl p-8 sm:p-10 text-center shadow-md border border-border/60">
          <div className="auth-success-icon w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-grade-s" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-3">인증 메일을 보냈습니다</h2>
          <p className="text-sm text-text-secondary mb-2 leading-relaxed">
            <span className="font-medium text-text-primary">{email}</span>로 발송된 인증 링크를 클릭하면 가입이 완료됩니다.
          </p>
          <p className="text-xs text-text-muted mb-7">
            이메일 인증 후 의사면허 인증을 진행합니다.
          </p>
          <a href="/auth/login" className="inline-block px-6 py-3 auth-btn-primary text-white font-semibold rounded-xl text-sm">
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full auth-slide-up">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center justify-center mb-8">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-sm shadow-sm">M</div>
          <span className="text-lg font-bold text-text-primary">MADMEDCHECK</span>
        </a>
      </div>

      <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-md border border-border/60">
        {/* Header with back */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-text-muted hover:text-text-primary hover:border-accent/30 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary">의사/원장 가입</h1>
            <p className="text-xs text-text-secondary mt-0.5">단계 {step}/2</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-7">
          <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'auth-progress-active' : 'bg-gray-200'}`} />
          <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'auth-progress-active' : 'bg-gray-200'}`} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-start gap-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 1 && (
            <>
              <div className="auth-slide-up auth-slide-up-delay-1">
                <label className="block text-sm font-medium text-text-primary mb-2">이름 (실명)</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  className="auth-input w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm transition-all"
                  placeholder="홍길동"
                />
              </div>
              <div className="auth-slide-up auth-slide-up-delay-2">
                <label className="block text-sm font-medium text-text-primary mb-2">병원명</label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  required
                  className="auth-input w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm transition-all"
                  placeholder="예: OO성형외과"
                />
              </div>
              <div className="auth-slide-up auth-slide-up-delay-3">
                <label className="block text-sm font-medium text-text-primary mb-2">진료과목</label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="auth-input w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-text-primary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm appearance-none transition-all"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="">선택</option>
                  <option value="성형외과">성형외과</option>
                  <option value="피부과">피부과</option>
                  <option value="치과">치과</option>
                  <option value="안과">안과</option>
                  <option value="한의원">한의원</option>
                  <option value="내과">내과</option>
                  <option value="정형외과">정형외과</option>
                  <option value="산부인과">산부인과</option>
                  <option value="비뇨기과">비뇨기과</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div className="auth-slide-up auth-slide-up-delay-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!contactName || !hospitalName}
                  className="auth-btn-primary w-full py-3.5 text-white font-semibold rounded-xl text-sm"
                >
                  다음
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="auth-slide-up auth-slide-up-delay-1">
                <label className="block text-sm font-medium text-text-primary mb-2">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm transition-all"
                  placeholder="email@example.com"
                />
              </div>
              <div className="auth-slide-up auth-slide-up-delay-2">
                <label className="block text-sm font-medium text-text-primary mb-2">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="auth-input w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm transition-all"
                  placeholder="6자 이상"
                />
              </div>
              <label className="auth-slide-up auth-slide-up-delay-3 flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-accent focus:ring-accent"
                />
                <span className="text-xs text-text-secondary leading-relaxed">
                  마케팅 정보 수신에 동의합니다. (선택)
                </span>
              </label>
              <div className="auth-slide-up auth-slide-up-delay-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="auth-btn-secondary flex-1 py-3.5 bg-white text-text-primary font-medium rounded-xl text-sm"
                >
                  이전
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-btn-primary flex-1 py-3.5 text-white font-semibold rounded-xl text-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      가입 중...
                    </span>
                  ) : '가입하기'}
                </button>
              </div>
            </>
          )}
        </form>

        <p className="text-center text-sm text-text-secondary mt-8">
          이미 계정이 있으신가요?{' '}
          <a href="/auth/login" className="text-accent font-semibold hover:text-accent-light transition-colors">로그인</a>
        </p>
      </div>
    </div>
  );
}

