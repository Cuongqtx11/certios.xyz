import { useState, useEffect, useRef } from 'react';
import './SigneSign.css';

// Progress steps definition
const STEPS = [
  { id: 'search', label: 'Tìm kiếm đơn hàng', icon: '🔍' },
  { id: 'cert', label: 'Tải chứng chỉ cá nhân', icon: '📜' },
  { id: 'sign', label: 'Ký ESign tự động', icon: '✍️' },
  { id: 'done', label: 'Hoàn tất – Sẵn sàng cài đặt', icon: '✅' },
];

const STEP_MAP: Record<string, number> = {
  'init': 0,
  'fetch_cert': 0,
  'download_cert': 1,
  'signing': 2,
  'done': 3,
  'error': -1
};

function SigneSign() {
  const [udid, setUdid] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check URL params for UDID
    const params = new URLSearchParams(window.location.search);
    const udidParam = params.get('udid');
    if (udidParam) {
      setUdid(udidParam);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      setShowResult(false);
      setInstallUrl('');
      addLog('⏰ Link cài đặt đã hết hạn và bị xoá để bảo mật.');
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [countdown]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`]);
  };

  const validateUDID = (value: string): boolean => {
    const regex1 = /^[a-f0-9]{40}$/i;
    const regex2 = /^[0-9a-f]{8}-[0-9a-f]{16}$/i;
    const regex3 = /^[a-zA-Z0-9\-]{6,}$/;
    return regex1.test(value) || regex2.test(value) || regex3.test(value);
  };

  const API_URL = import.meta.env.VITE_API_URL || 'https://api.certios.xyz';

  const pollJobStatus = (jobId: string) => {
    let lastMessage = '';

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/signesign/status/${jobId}`);
        const data = await response.json();

        // Update progress
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }

        // Update step
        if (data.step && STEP_MAP[data.step] !== undefined) {
          const stepIndex = STEP_MAP[data.step];
          if (stepIndex >= 0) setCurrentStep(stepIndex);
        }

        // Add log if message changed
        if (data.message && data.message !== lastMessage) {
          lastMessage = data.message;
          if (data.status === 'error') {
            addLog(`✗ ${data.message}`);
          } else if (data.status === 'done') {
            addLog(`✓ ${data.message}`);
          } else {
            addLog(`⏳ ${data.message}`);
          }
        }

        // Handle completion
        if (data.status === 'done') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;

          setCurrentStep(3);
          setProgress(100);
          addLog('🎉 Hoàn tất toàn bộ quy trình!');
          addLog('   Hệ thống sẽ tự động xoá file sau 10 phút để bảo mật.');

          setInstallUrl(data.installUrl || '');
          setShowResult(true);
          setIsProcessing(false);
          
          const timeElapsed = Math.floor((Date.now() - (data.doneAt || Date.now())) / 1000);
          let remaining = 600 - timeElapsed;
          if (remaining < 0) remaining = 0;
          
          setCountdown(remaining);
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
          }, 1000);
        }

        // Handle error
        if (data.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;

          setError(data.message || 'Có lỗi xảy ra');
          setProgress(0);
          setIsProcessing(false);
        }
      } catch (err) {
        // Network error - keep polling
        console.error('Poll error:', err);
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleProcess = async () => {
    if (!udid.trim()) {
      setError('Vui lòng nhập UDID thiết bị');
      inputRef.current?.focus();
      return;
    }

    if (!validateUDID(udid.trim())) {
      setError('UDID không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    setError('');
    setIsProcessing(true);
    setShowResult(false);
    setInstallUrl('');
    setLogs([]);
    setCurrentStep(0);
    setProgress(0);

    // Clear any existing poll
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    try {
      addLog('Đang gửi yêu cầu đến hệ thống...');
      setProgress(5);

      const response = await fetch(`${API_URL}/api/signesign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ udid: udid.trim() })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Có lỗi xảy ra từ máy chủ');
      }

      addLog('✓ ' + data.message);

      // Start polling for job status
      if (data.jobId) {
        addLog('Đang theo dõi tiến trình ký...');
        pollJobStatus(data.jobId);
      } else {
        throw new Error('Không nhận được Job ID từ server');
      }

    } catch (err: any) {
      addLog(`✗ Lỗi: ${err.message || 'Có lỗi xảy ra'}`);
      setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleProcess();
    }
  };

  return (
    <div className="ss-page">
      {/* Ambient glow effects */}
      <div className="ss-ambient-glow ss-glow-1"></div>
      <div className="ss-ambient-glow ss-glow-2"></div>
      <div className="ss-ambient-glow ss-glow-3"></div>

      <div className="ss-container">
        {/* Header */}
        <header className="ss-header">
          <a href="/" className="ss-back-link">
            <i className="fas fa-arrow-left"></i>
            <span>CERTIOS.XYZ</span>
          </a>
          <div className="ss-header-badge">
            <i className="fas fa-lock"></i>
            <span>Trang Ẩn</span>
          </div>
        </header>

        {/* Hero Section */}
        <div className="ss-hero">
          <div className="ss-hero-icon">
            <div className="ss-hero-icon-inner">
              <i className="fas fa-file-signature"></i>
            </div>
            <div className="ss-hero-ring ss-ring-1"></div>
            <div className="ss-hero-ring ss-ring-2"></div>
          </div>
          <h1 className="ss-title">SigneSign</h1>
          <p className="ss-subtitle">Tự Động Ký Chứng Chỉ Cá Nhân & Cài Đặt</p>
          <p className="ss-desc">
            Nhập UDID thiết bị để tự động tải chứng chỉ cá nhân từ đơn hàng Cuios.shop,
            ký ESign và nhận link cài đặt trực tiếp.
          </p>
        </div>

        {/* Input Section */}
        <div className="ss-input-section ss-glass">
          <div className="ss-input-wrapper">
            <div className="ss-input-icon">
              <i className="fas fa-fingerprint"></i>
            </div>
            <input
              ref={inputRef}
              type="text"
              className="ss-input"
              placeholder="Nhập UDID thiết bị của bạn..."
              value={udid}
              onChange={(e) => {
                setUdid(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              autoComplete="on"
            />
            {udid && !isProcessing && (
              <button className="ss-input-clear" onClick={() => setUdid('')}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
          {error && (
            <div className="ss-error">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}
          <button
            className={`ss-btn-process ${isProcessing ? 'processing' : ''}`}
            onClick={handleProcess}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <div className="ss-btn-spinner"></div>
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <i className="fas fa-bolt"></i>
                <span>Bắt Đầu Ký Tự Động</span>
              </>
            )}
          </button>
        </div>

        {/* Progress Section */}
        {currentStep >= 0 && (
          <div className="ss-progress-section ss-glass ss-fade-in">
            {/* Progress Bar */}
            <div className="ss-progress-bar-wrapper">
              <div className="ss-progress-bar">
                <div
                  className="ss-progress-fill"
                  style={{ width: `${progress}%`, transition: 'width 0.5s ease-out' }}
                >
                  <div className="ss-progress-shine"></div>
                </div>
              </div>
              <div className="ss-progress-percent">{Math.round(progress)}%</div>
            </div>

            {/* Steps */}
            <div className="ss-steps">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={`ss-step ${
                    index < currentStep
                      ? 'completed'
                      : index === currentStep
                      ? 'active'
                      : 'pending'
                  }`}
                >
                  <div className="ss-step-indicator">
                    {index < currentStep ? (
                      <i className="fas fa-check"></i>
                    ) : index === currentStep ? (
                      <div className="ss-step-pulse">
                        <span>{step.icon}</span>
                      </div>
                    ) : (
                      <span className="ss-step-number">{index + 1}</span>
                    )}
                  </div>
                  <div className="ss-step-content">
                    <span className="ss-step-label">{step.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Terminal Log */}
            <div className="ss-terminal">
              <div className="ss-terminal-header">
                <div className="ss-terminal-dots">
                  <span className="ss-dot red"></span>
                  <span className="ss-dot yellow"></span>
                  <span className="ss-dot green"></span>
                </div>
                <span className="ss-terminal-title">SigneSign Terminal</span>
              </div>
              <div className="ss-terminal-body">
                {logs.map((log, i) => (
                  <div key={i} className="ss-log-line">
                    <span className={
                      log.includes('✓') ? 'ss-log-success' :
                      log.includes('✗') ? 'ss-log-error' :
                      log.includes('⚠') ? 'ss-log-warn' :
                      log.includes('🎉') ? 'ss-log-done' :
                      'ss-log-info'
                    }>
                      {log}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Result Section */}
        {showResult && installUrl && (
          <div className="ss-result ss-fade-in">
            <div className="ss-result-header">
              <div className="ss-result-icon-wrap">
                <i className="fas fa-check-circle"></i>
              </div>
              <h2>Ký Thành Công!</h2>
              <p>Chứng chỉ đã sẵn sàng. Hãy cài đặt ngay trước khi hết hạn.</p>
            </div>

            {/* Install Button */}
            <div className="ss-install-grid">
              <a
                href={installUrl}
                className="ss-install-btn ss-btn-esign large-install-btn"
              >
                <div className="ss-install-icon">
                  <i className="fas fa-signature"></i>
                </div>
                <div className="ss-install-text">
                  <span className="ss-install-title">Bấm vào đây để cài ESign</span>
                  <span className="ss-install-sub">Cài đặt trực tiếp vào thiết bị</span>
                </div>
                <i className="fas fa-external-link-alt ss-install-arrow"></i>
              </a>
            </div>

            {/* Reminder */}
            <div className="ss-reminder ss-glass">
              <i className="fas fa-info-circle"></i>
              <div>
                <strong>Lưu ý:</strong> Với iOS 16 trở lên, hãy bật <em>Chế độ nhà phát triển</em> tại:
                <br />
                <code>Cài đặt → Quyền riêng tư và bảo mật → Chế độ nhà phát triển</code>
              </div>
            </div>

            {/* Timer */}
            <div className="ss-reminder ss-glass" style={{ borderColor: 'rgba(255,165,0,0.3)' }}>
              <i className="fas fa-clock" style={{ color: '#ffa500' }}></i>
              <div>
                <strong>⏰ Link cài đặt sẽ tự động hết hạn sau: 
                  <span style={{ color: '#ffa500', fontSize: '1.2em', marginLeft: '8px' }}>
                    {countdown ? `${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, '0')}` : '0:00'}
                  </span>
                </strong>
                <br />
                Vui lòng cài đặt ngay!
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="ss-footer">
          <p>© 2026 CERTIOS.XYZ — SigneSign</p>
          <a href="https://cuios.shop" target="_blank" rel="noopener noreferrer">
            Powered by Cuios.shop
          </a>
        </footer>
      </div>
    </div>
  );
}

export default SigneSign;
