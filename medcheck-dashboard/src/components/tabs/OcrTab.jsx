import { useState } from 'react';
import { API_BASE } from '../../lib/config';

export default function OcrTab() {
  const [imageUrl, setImageUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async () => {
    if (!imageUrl.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageUrl.trim(), mode: 'ocr' }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || '분석 실패');
      }
    } catch (e) {
      setError(e.message);
    }
    setAnalyzing(false);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">OCR 분석</h2>
      <p className="text-sm text-text-secondary mb-6">이미지 기반 의료광고 텍스트 추출 및 위반 분석</p>

      {/* Input */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <label className="text-sm font-medium text-text-primary block mb-2">이미지 URL</label>
        <div className="flex gap-3">
          <input
            type="text"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://example.com/ad-image.jpg"
            className="flex-1 bg-navy-800/30 border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
          />
          <button
            onClick={analyze}
            disabled={analyzing || !imageUrl.trim()}
            className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-light transition-colors disabled:opacity-50"
          >
            {analyzing ? '분석 중...' : '분석'}
          </button>
        </div>
      </div>

      {/* Preview + Result */}
      <div className="grid grid-cols-2 gap-4">
        {/* Image preview */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">이미지 미리보기</h3>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="OCR target"
              className="w-full rounded-lg border border-border object-contain max-h-[400px]"
              onError={() => setError('이미지를 불러올 수 없습니다.')}
            />
          ) : (
            <div className="flex items-center justify-center h-[300px] bg-navy-800/20 rounded-lg">
              <p className="text-sm text-text-secondary">이미지 URL을 입력해 주세요</p>
            </div>
          )}
        </div>

        {/* Result */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">분석 결과</h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {result ? (
            <div className="space-y-3">
              {result.extractedText && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">추출 텍스트</p>
                  <pre className="text-xs text-text-primary bg-navy-800/30 rounded-lg p-3 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {result.extractedText}
                  </pre>
                </div>
              )}
              {result.violations?.length > 0 && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">위반 탐지 ({result.violations.length}건)</p>
                  <div className="space-y-2">
                    {result.violations.map((v, i) => (
                      <div key={i} className="bg-navy-800/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            v.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            v.severity === 'major' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {v.severity}
                          </span>
                          <span className="text-xs font-mono text-text-secondary">{v.patternId}</span>
                        </div>
                        <p className="text-xs text-text-primary">{v.matchedText}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!result.violations || result.violations.length === 0) && (
                <p className="text-sm text-emerald-400">위반 사항이 없습니다.</p>
              )}
            </div>
          ) : !analyzing ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-sm text-text-secondary">이미지를 분석하면 결과가 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px]">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
