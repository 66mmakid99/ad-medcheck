import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import LicenseUpload from './LicenseUpload';

export default function VerifyPage() {
  const { profile, user, loading, initialized, init } = useAuth();

  useEffect(() => {
    if (!initialized) init();
  }, [initialized, init]);

  if (!initialized || loading) {
    return (
      <div className="w-full max-w-md mx-auto auth-slide-up">
        <div className="bg-white rounded-2xl p-8 sm:p-10 text-center shadow-md border border-border/60">
          <svg className="animate-spin w-10 h-10 text-accent mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/auth/login';
    return null;
  }

  // 이미 인증 완료된 유저
  if (profile?.verification_status === 'auto_approved' || profile?.verification_status === 'manual_approved') {
    return (
      <div className="w-full max-w-md mx-auto auth-slide-up">
        <div className="bg-white rounded-2xl p-8 sm:p-10 text-center shadow-md border border-border/60">
          <div className="auth-success-icon w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-grade-s" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-3">이미 인증되었습니다</h2>
          <p className="text-sm text-text-secondary mb-7">계정이 인증된 상태입니다.</p>
          <a href="/dashboard" className="inline-block px-8 py-3.5 auth-btn-primary text-white font-semibold rounded-xl text-sm">
            대시보드로 이동
          </a>
        </div>
      </div>
    );
  }

  const signupPath = profile?.signup_path;

  return (
    <div className="w-full max-w-md mx-auto auth-slide-up">
      <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-md border border-border/60">
        {/* Header */}
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-accent/8 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary">본인 인증</h1>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            의사면허증을 제출하여 본인을 인증하세요.
          </p>
        </div>

        <LicenseUpload />
      </div>
    </div>
  );
}

