import { useState, useEffect, useRef } from 'react';
import './SigneSign.css';

// Progress steps definition
const STEPS = [
  { id: 'search', label: 'Tìm kiếm đơn hàng', icon: '🔍' },
  { id: 'cert', label: 'Tải chứng chỉ cá nhân', icon: '📜' },
  { id: 'sign', label: 'Ký ESign tự động', icon: '✍️' },
  { id: 'done', label: 'Hoàn tất – Sẵn sàng cài đặt', icon: '✅' },
];

interface OrderData {
  model: string;
  udid: string;
  remainTime: string;
}

interface CertData {
  certFile: string;
  ESign: string;
  Scarlet?: string;
  GBox?: string;
  MoreIPA?: string;
  UnlockIPA?: string;
  UnlockIPAweb?: string;
  UnlockIPA_Mini?: string;
  UnlockIPA_TRIAL?: string;
  password: string;
}

function SigneSign() {
  const [udid, setUdid] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [certData, setCertData] = useState<CertData | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check URL params for UDID
    const params = new URLSearchParams(window.location.search);
    const udidParam = params.get('udid');
    if (udidParam) {
      setUdid(udidParam);
    }
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`]);
  };

  const animateProgress = (from: number, to: number, duration: number): Promise<void> => {
    return new Promise(resolve => {
      const start = performance.now();
      const animate = (now: number) => {
        const elapsed = now - start;
        const ratio = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - ratio, 3);
        setProgress(from + (to - from) * eased);
        if (ratio < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  };

  const validateUDID = (value: string): boolean => {
    const regex1 = /^[a-f0-9]{40}$/i;
    const regex2 = /^[0-9a-f]{8}-[0-9a-f]{16}$/i;
    const regex3 = /^[a-zA-Z0-9]{6}$/;
    return regex1.test(value) || regex2.test(value) || regex3.test(value);
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
    setOrderData(null);
    setCertData(null);
    setLogs([]);
    setCurrentStep(0);
    setProgress(0);

    try {
      // Step 1 & 2 & 3: Call backend API
      addLog('Đang gửi yêu cầu đến hệ thống...');
      await animateProgress(0, 30, 800);

      const API_URL = import.meta.env.VITE_API_URL || 'https://api.p12.vn';
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
      await animateProgress(30, 60, 1000);
      
      // Since the backend handles the full process, we simulate the remaining progress
      addLog('Đang ký ESign tự động với chứng chỉ cá nhân...');
      await animateProgress(60, 80, 1500);
      addLog('✓ Chuẩn bị link cài đặt ESign...');
      await animateProgress(80, 95, 1000);

      // Step 4: Done
      setCurrentStep(3);
      addLog('🎉 Hoàn tất toàn bộ quy trình!');
      addLog('   Hệ thống sẽ tự động xoá file sau 5 phút để bảo mật.');
      await animateProgress(95, 100, 500);

      setCertData({
          certFile: '',
          ESign: data.installUrl || '',
          password: 'Lưu trên server'
      });
      setShowResult(true);
    } catch (err: any) {
      addLog(`✗ Lỗi: ${err.message || 'Có lỗi xảy ra'}`);
      setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
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
                  style={{ width: `${progress}%` }}
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

        {/* Order Info */}
        {orderData && (
          <div className="ss-info-card ss-glass ss-fade-in">
            <div className="ss-info-header">
              <i className="fas fa-receipt"></i>
              <h3>Thông Tin Đơn Hàng</h3>
            </div>
            <div className="ss-info-grid">
              <div className="ss-info-item">
                <span className="ss-info-label">
                  <i className="fas fa-mobile-alt"></i> Thiết bị
                </span>
                <span className="ss-info-value">{orderData.model}</span>
              </div>
              <div className="ss-info-item">
                <span className="ss-info-label">
                  <i className="fas fa-id-badge"></i> UDID
                </span>
                <span className="ss-info-value ss-mono">{orderData.udid}</span>
              </div>
              <div className="ss-info-item">
                <span className="ss-info-label">
                  <i className="fas fa-hourglass-half"></i> Trạng thái
                </span>
                <span className={`ss-info-badge ${orderData.remainTime === 'DONE' ? 'success' : 'warning'}`}>
                  {orderData.remainTime === 'DONE' ? '✅ Hoàn tất' : orderData.remainTime}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Result Section */}
        {showResult && certData && (
          <div className="ss-result ss-fade-in">
            <div className="ss-result-header">
              <div className="ss-result-icon-wrap">
                <i className="fas fa-check-circle"></i>
              </div>
              <h2>Ký Thành Công!</h2>
              <p>Chứng chỉ đã sẵn sàng. Chọn phương thức cài đặt bên dưới.</p>
            </div>

            {/* Certificate Info */}
            <div className="ss-cert-info ss-glass">
              <div className="ss-cert-row">
                <span className="ss-cert-label">
                  <i className="fas fa-key"></i> Mật khẩu chứng chỉ
                </span>
                <span className="ss-cert-password">{certData.password}</span>
              </div>
            </div>

            {/* Install Buttons */}
            <div className="ss-install-grid">
              {certData.certFile && (
                <a
                  href={certData.certFile.trim() + '?dl'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-cert"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-certificate"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">Tải Chứng Chỉ</span>
                    <span className="ss-install-sub">File .p12 + .mobileprovision</span>
                  </div>
                  <i className="fas fa-download ss-install-arrow"></i>
                </a>
              )}

              {certData.ESign && (
                <a
                  href={certData.ESign.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-esign"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-signature"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">Cài Đặt ESign</span>
                    <span className="ss-install-sub">Ký và cài ứng dụng IPA</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}

              {certData.GBox && (
                <a
                  href={certData.GBox.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-gbox"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-box-open"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">Cài Đặt GBox</span>
                    <span className="ss-install-sub">Ứng dụng quản lý IPA</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}

              {certData.Scarlet && (
                <a
                  href={certData.Scarlet.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-scarlet"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-feather-alt"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">Cài Đặt Scarlet</span>
                    <span className="ss-install-sub">Kho ứng dụng thay thế</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}

              {certData.UnlockIPA_Mini && (
                <a
                  href={certData.UnlockIPA_Mini.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-unlock"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-unlock-alt"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">UnlockIPA Mini</span>
                    <span className="ss-install-sub">All in One</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}

              {certData.UnlockIPA && (
                <a
                  href={certData.UnlockIPA.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-unlock"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-lock-open"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">UnlockIPA</span>
                    <span className="ss-install-sub">Mở khoá ứng dụng</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}

              {certData.MoreIPA && (
                <a
                  href={certData.MoreIPA.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-install-btn ss-btn-more"
                >
                  <div className="ss-install-icon">
                    <i className="fas fa-th-large"></i>
                  </div>
                  <div className="ss-install-text">
                    <span className="ss-install-title">Cài IPA Khác</span>
                    <span className="ss-install-sub">Thêm nhiều ứng dụng</span>
                  </div>
                  <i className="fas fa-external-link-alt ss-install-arrow"></i>
                </a>
              )}
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
