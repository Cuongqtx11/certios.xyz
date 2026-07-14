import { useState, useEffect } from 'react';
import './App.css';

// Translations
const t = {
  vi: {
    subtitle: "Chứng Chỉ Doanh Nghiệp Miễn Phí",
    dns: "DNS Chặn Thu Hồi",
    dnsDesc: "Cài cấu hình để sử dụng ESign an toàn",
    dnsWarning: "Đây là cấu hình bắt buộc cài đặt trước tiên",
    get: "NHẬN",
    footerWait: "Giao diện chờ dữ liệu API của bạn.",
    signed: "Good",
    revoked: "Thu hồi",
    alertMsg: "Chức năng tải",
    support: "Liên Hệ Hỗ Trợ 24/7",
    community: "Tham Gia Cộng Đồng",
    autoStore: "Website Bán Chứng Chỉ Tự Động",
    freeCert: "⚡ CHỨNG CHỈ MIỄN PHÍ",
    free1: "Thời gian không ổn định",
    free2: "Có thể bị thu hồi",
    free3: "Dùng chung nhiều người",
    free4: "Phù hợp trải nghiệm",
    premCert: "⭐ CHỨNG CHỈ CÁ NHÂN",
    prem1: "Ổn định trọn vẹn 1 năm",
    prem2: "Không lo bị thu hồi",
    prem3: "UDID riêng biệt",
    prem4: "Cài thoải mái, bền vững",
    faqTitle: "Câu hỏi thường gặp (FAQ)",
    faqQ1: "Ứng dụng ESign để làm gì?",
    faqA1: "ESign cho phép bạn ký và cài đặt trực tiếp các tệp IPA (ứng dụng iOS) lên iPhone hoặc iPad mà không cần qua App Store.",
    faqQ2: "Ứng dụng này có dùng được lâu không?",
    faqA2_1: "Các chứng chỉ doanh nghiệp miễn phí thường không ổn định và có thể bị Apple thu hồi bất cứ lúc nào. Để có trải nghiệm ổn định và lâu dài, bạn nên tham khảo giải pháp chứng chỉ cá nhân tại ",
    faqQ3: "Tại sao ứng dụng bị thu hồi?",
    faqA3: "Apple thường xuyên quét và thu hồi các chứng chỉ doanh nghiệp bị lạm dụng. Khi chứng chỉ bị thu hồi, mọi ứng dụng ký bằng chứng chỉ đó sẽ ngừng hoạt động.",
    faqQ4: "Có cần jailbreak để sử dụng không?",
    faqA4: "Hoàn toàn không. ESign và các chứng chỉ mà chúng tôi cung cấp hoạt động trên thiết bị nguyên bản, không yêu cầu jailbreak, đảm bảo an toàn cho thiết bị của bạn.",
    faqQ5: "Làm sao để hạn chế bị thu hồi?",
    faqA5: "Bạn có thể sử dụng DNS chặn thu hồi (có trong mục \"DNS và Công Cụ Tiện Ích\") để giảm thiểu rủi ro. Tuy nhiên, cách triệt để nhất là chuyển sang sử dụng chứng chỉ cá nhân riêng biệt, đảm bảo không bị ảnh hưởng bởi các đợt quét của Apple."
  },
  en: {
    subtitle: "Free Enterprise Certificates",
    dns: "Anti-Revoke DNS",
    dnsDesc: "Install profile to use ESign safely",
    dnsWarning: "This is a mandatory profile to install first",
    get: "GET",
    footerWait: "Interface waiting for your API data.",
    signed: "Good",
    revoked: "Revoked",
    alertMsg: "Download feature for",
    support: "24/7 Support Contact",
    community: "Join Community",
    autoStore: "Automated Certificate Store",
    freeCert: "⚡ FREE CERTIFICATES",
    free1: "Unstable duration",
    free2: "Can be revoked anytime",
    free3: "Shared with many users",
    free4: "Good for testing",
    premCert: "⭐ PERSONAL CERTIFICATES",
    prem1: "Stable for full 1 year",
    prem2: "No revoke worries",
    prem3: "Dedicated UDID",
    prem4: "Install freely, durable",
    faqTitle: "Frequently Asked Questions (FAQ)",
    faqQ1: "What is the ESign app for?",
    faqA1: "ESign allows you to sign and directly install IPA files (iOS apps) on your iPhone or iPad without going through the App Store.",
    faqQ2: "How long can I use this app?",
    faqA2_1: "Free enterprise certificates are typically unstable and can be revoked by Apple at any time. For a stable and long-term experience, you should consider a personal certificate solution at ",
    faqQ3: "Why do apps get revoked?",
    faqA3: "Apple regularly scans and revokes abused enterprise certificates. Once revoked, all apps signed with that certificate will stop working.",
    faqQ4: "Do I need to jailbreak to use this?",
    faqA4: "Absolutely not. ESign and the certificates we provide work on non-jailbroken devices, ensuring your device's safety.",
    faqQ5: "How can I prevent revokes?",
    faqA5: "You can use the Anti-Revoke DNS (found in the \"Anti-Revoke DNS\" section) to minimize risks. However, the ultimate solution is to switch to a dedicated personal certificate, ensuring immunity from Apple's scans."
  }
};

function App() {
  const [esignData, setEsignData] = useState<any[]>([]);
  const [certData, setCertData] = useState<any[]>([]);
  const [modsData, setModsData] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/apps.json?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        setEsignData(data.esign || []);
        setCertData(data.cert || []);
        setModsData(data.mods || []);
      })
      .catch(err => console.error('Error fetching apps.json:', err));
  }, []);

  const [activeTab, setActiveTab] = useState<'esign' | 'cert' | 'mods'>('esign');
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [curtainClass, setCurtainClass] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  // Handle Theme Toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Handle Language Switch with Curtain Transition
  const switchLanguage = (newLang: 'vi' | 'en') => {
    if (lang === newLang || isTransitioning) return;
    
    setIsTransitioning(true);
    setCurtainClass('slide-in');
    
    setTimeout(() => {
      setLang(newLang);
      setCurtainClass('slide-in slide-out');
      
      setTimeout(() => {
        setCurtainClass('');
        setIsTransitioning(false);
      }, 500); // Wait for slide-out to finish
    }, 500); // Wait for slide-in to cover screen
  };

  const handleDownload = (app: any) => {
    if (app.installUrl) {
      window.location.href = app.installUrl;
    } else {
      alert(`${t[lang].alertMsg} [${app.name}] chưa được tích hợp.`);
    }
  };

  const renderAppCard = (app: any) => (
    <div key={app.id} className="app-card glass">
      <div className="app-header">
        <div className="app-icon" style={{ background: (activeTab === 'esign' || activeTab === 'cert' || (activeTab === 'mods' && app.icon)) ? 'transparent' : 'var(--gradient-2)', boxShadow: (activeTab === 'esign' || activeTab === 'cert' || (activeTab === 'mods' && app.icon)) ? 'none' : '0 4px 12px var(--primary-glow)' }}>
          {activeTab === 'esign' && <img src="https://vsacheat.com/img/esign.png" alt="ESign" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />}
          {activeTab === 'cert' && <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiEQCh3W32OqIspAx8-OlEnTiDGXz8eYRMfz15DL4vrw&s=10" alt="Cert" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />}
          {activeTab === 'mods' && (app.icon ? <img src={app.icon} alt={app.name} style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} /> : <i className="fas fa-gamepad"></i>)}
        </div>
        <div className="app-info">
          <h3>{app.name}</h3>
          <p>{app.developer}</p>
          {app.size && app.size !== 'N/A' && (
            <div className="app-badges">
              <span className="badge">{app.size}</span>
            </div>
          )}
          {app.description && <p className="app-desc" style={{ fontSize: '0.85rem', color: '#ccc', marginTop: '4px' }}>{app.description}</p>}
        </div>
      </div>
      <div className="card-actions" style={{ display: 'flex', gap: '8px' }}>
        <button 
          className="btn-get" 
          onClick={() => handleDownload(app)}
          style={{ flex: 1, opacity: (app.status === 'active' || app.status === 'Signed') ? 1 : 0.5 }}
          disabled={(app.status !== 'active' && app.status !== 'Signed')}
        >
          <i className="fas fa-download"></i> {t[lang].get}
        </button>
        {app.ipaUrl && (
          <button 
            className="btn-get" 
            onClick={() => window.location.href = app.ipaUrl}
            style={{ flex: 1, opacity: (app.status === 'active' || app.status === 'Signed') ? 1 : 0.5 }}
            disabled={(app.status !== 'active' && app.status !== 'Signed')}
          >
            <i className="fas fa-file-archive"></i> IPA
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Game Transition Curtain */}
      <div className={`transition-curtain ${curtainClass}`}>
        <div className="curtain-logo">CERTIOS.XYZ</div>
      </div>

      <div className="app-container">
        {/* Top Header */}
        <div className="top-header">
          <a href="https://cuios.shop" target="_blank" rel="noopener noreferrer" className="logo-text">CERTIOS.XYZ</a>
          <div className="header-controls">
            <div className="lang-switcher">
              <button 
                className={`lang-btn ${lang === 'vi' ? 'active' : ''}`}
                onClick={() => switchLanguage('vi')}
              >
                VN
              </button>
              <button 
                className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => switchLanguage('en')}
              >
                EN
              </button>
            </div>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <i className={theme === 'dark' ? "fas fa-sun" : "fas fa-moon"}></i>
            </button>
          </div>
        </div>

        {/* Header */}
        <header className="header">
          <i className="fab fa-apple apple-icon-header"></i>
          <h1 className="title">APPLE CERTIFICATE.</h1>
          <p className="subtitle">{t[lang].subtitle}</p>
        </header>

        {/* Action Links */}
        <div className="links-container">
          <a href="https://t.me/tomqtx1111" target="_blank" rel="noopener noreferrer" className="action-link glass">
            <i className="fas fa-headset action-icon" style={{ color: '#FF8C42' }}></i>
            <span>{t[lang].support}</span>
          </a>
          <a href="https://t.me/chungchicuios" target="_blank" rel="noopener noreferrer" className="action-link glass">
            <i className="fas fa-users action-icon" style={{ color: '#34B7F1' }}></i>
            <span>{t[lang].community}</span>
          </a>
          <a href="https://cuios.shop" target="_blank" rel="noopener noreferrer" className="action-link glass">
            <i className="fas fa-globe action-icon" style={{ color: '#E91E63' }}></i>
            <span>{t[lang].autoStore}</span>
          </a>
        </div>

        {/* Compare Section */}
        <div className="compare-section">
          <div className="compare-row">
            <div className="compare-col glass">
              <div className="compare-label compare-label-free">{t[lang].freeCert}</div>
              <ul className="compare-list">
                <li><i className="fas fa-minus-circle"></i> {t[lang].free1}</li>
                <li><i className="fas fa-minus-circle"></i> {t[lang].free2}</li>
                <li><i className="fas fa-minus-circle"></i> {t[lang].free3}</li>
                <li><i className="fas fa-minus-circle"></i> {t[lang].free4}</li>
              </ul>
            </div>
            <div className="compare-col glass">
              <div className="compare-label compare-label-premium">{t[lang].premCert}</div>
              <ul className="compare-list">
                <li><i className="fas fa-check-circle"></i> {t[lang].prem1}</li>
                <li><i className="fas fa-check-circle"></i> {t[lang].prem2}</li>
                <li><i className="fas fa-check-circle"></i> {t[lang].prem3}</li>
                <li><i className="fas fa-check-circle"></i> {t[lang].prem4}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* DNS Banner */}
        <a href="/dns-anti-revoke.mobileconfig" className="dns-banner glass">
          <div className="dns-info">
            <div className="dns-icon">
              <i className="fas fa-shield-alt"></i>
            </div>
            <div className="dns-text">
              <h4>{t[lang].dns}</h4>
              <p>{t[lang].dnsDesc}</p>
              <p className="dns-warning"><i className="fas fa-exclamation-triangle"></i> {t[lang].dnsWarning}</p>
            </div>
          </div>
          <div className="dns-arrow">
            <i className="fas fa-chevron-right"></i>
          </div>
        </a>

        {/* Tabs */}
        <div className="tab-container glass">
          <button 
            className={`tab-btn ${activeTab === 'esign' ? 'active' : ''}`}
            onClick={() => setActiveTab('esign')}
          >
            <i className="fas fa-signature"></i> ESign
          </button>
          <button 
            className={`tab-btn ${activeTab === 'cert' ? 'active' : ''}`}
            onClick={() => setActiveTab('cert')}
          >
            <i className="fas fa-certificate"></i> Cert
          </button>
          <button 
            className={`tab-btn ${activeTab === 'mods' ? 'active' : ''}`}
            onClick={() => setActiveTab('mods')}
          >
            <i className="fas fa-cogs"></i> Mods
          </button>
        </div>

        {/* List Content */}
        <main className="app-grid">
          {activeTab === 'esign' && esignData.slice(0, 12).map(renderAppCard)}
          {activeTab === 'cert' && certData.slice(0, 12).map(renderAppCard)}
          {activeTab === 'mods' && modsData.slice(0, 12).map(renderAppCard)}
        </main>
        
        {/* FAQ Section */}
        <div className="faq-section glass">
          <h3 className="faq-title">{t[lang].faqTitle}</h3>
          
          <div className={`faq-item ${openFaqIndex === 0 ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleFaq(0)}>{t[lang].faqQ1} <i className="fas fa-chevron-down"></i></button>
            <div className="faq-answer">{t[lang].faqA1}</div>
          </div>
          
          <div className={`faq-item ${openFaqIndex === 1 ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleFaq(1)}>{t[lang].faqQ2} <i className="fas fa-chevron-down"></i></button>
            <div className="faq-answer">{t[lang].faqA2_1}<a href="https://cuios.shop" target="_blank" rel="noopener noreferrer">cuios.shop</a>.</div>
          </div>
          
          <div className={`faq-item ${openFaqIndex === 2 ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleFaq(2)}>{t[lang].faqQ3} <i className="fas fa-chevron-down"></i></button>
            <div className="faq-answer">{t[lang].faqA3}</div>
          </div>
          
          <div className={`faq-item ${openFaqIndex === 3 ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleFaq(3)}>{t[lang].faqQ4} <i className="fas fa-chevron-down"></i></button>
            <div className="faq-answer">{t[lang].faqA4}</div>
          </div>
          
          <div className={`faq-item ${openFaqIndex === 4 ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => toggleFaq(4)}>{t[lang].faqQ5} <i className="fas fa-chevron-down"></i></button>
            <div className="faq-answer">{t[lang].faqA5}</div>
          </div>
        </div>

        {/* Footer */}
        <footer>
          <p>&copy; 2026 CERTIOS.XYZ</p>
        </footer>
      </div>
    </>
  );
}

export default App;
