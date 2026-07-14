import { useState, useEffect } from 'react';
import './App.css';

// Translations
const t = {
  vi: {
    subtitle: "Chứng Chỉ Doanh Nghiệp Miễn Phí",
    dns: "DNS Chặn Thu Hồi",
    dnsDesc: "Cài cấu hình để sử dụng ESign an toàn",
    get: "NHẬN",
    footerWait: "Giao diện chờ dữ liệu API của bạn.",
    signed: "Good",
    revoked: "Thu hồi",
    alertMsg: "Chức năng tải"
  },
  en: {
    subtitle: "Free Enterprise Certificates",
    dns: "Anti-Revoke DNS",
    dnsDesc: "Install profile to use ESign safely",
    get: "GET",
    footerWait: "Interface waiting for your API data.",
    signed: "Good",
    revoked: "Revoked",
    alertMsg: "Download feature for"
  }
};

// Mock data based on tabs
const esignData = [
  {
    id: 'e1',
    name: 'ESign 5.0.2',
    developer: 'China Academy of Railway Sciences',
    size: '11.05 MB',
    status: 'active',
  },
  {
    id: 'e2',
    name: 'ESign 5.0.0 (No Logs)',
    developer: 'Hubei Bank Corporation',
    size: '10.2 MB',
    status: 'revoked',
  }
];

const certData = [
  {
    id: 'c1',
    name: 'China Mobile Group',
    developer: 'com.chinamobile.group',
    size: 'P12 Certificate',
    status: 'active',
  },
  {
    id: 'c2',
    name: 'Hubei Bank Corporation',
    developer: 'com.hubeibank.ios',
    size: 'P12 Certificate',
    status: 'revoked',
  }
];

const modsData = [
  {
    id: 'm1',
    name: 'Spotify++',
    developer: 'Premium Unlocked',
    size: '150.2 MB',
    status: 'active',
  },
  {
    id: 'm2',
    name: 'TikTok Dark',
    developer: 'No Watermark + Region Unlocked',
    size: '230.5 MB',
    status: 'active',
  }
];

function App() {
  const [activeTab, setActiveTab] = useState<'esign' | 'cert' | 'mods'>('esign');
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [curtainClass, setCurtainClass] = useState('');

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

  const handleDownload = (appName: string) => {
    alert(`${t[lang].alertMsg} [${appName}] chưa được tích hợp.`);
  };

  const renderAppCard = (app: any) => (
    <div key={app.id} className="app-card glass">
      <div className="app-header">
        <div className="app-icon" style={{ background: (activeTab === 'esign' || activeTab === 'cert') ? 'transparent' : 'var(--gradient-2)', boxShadow: (activeTab === 'esign' || activeTab === 'cert') ? 'none' : '0 4px 12px var(--primary-glow)' }}>
          {activeTab === 'esign' && <img src="https://vsacheat.com/img/esign.png" alt="ESign" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />}
          {activeTab === 'cert' && <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiEQCh3W32OqIspAx8-OlEnTiDGXz8eYRMfz15DL4vrw&s=10" alt="Cert" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />}
          {activeTab === 'mods' && <i className="fas fa-gamepad"></i>}
        </div>
        <div className="app-info">
          <h3>{app.name}</h3>
          <p>{app.developer}</p>
          <div className="app-badges">
            <span className="badge">{app.size}</span>
            <span className={`badge ${app.status}`}>
              {app.status === 'active' ? t[lang].signed : t[lang].revoked}
            </span>
          </div>
        </div>
      </div>
      <button 
        className="btn-get" 
        onClick={() => handleDownload(app.name)}
        style={{ opacity: app.status === 'active' ? 1 : 0.5 }}
        disabled={app.status !== 'active'}
      >
        <i className="fas fa-download"></i> {t[lang].get}
      </button>
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
          <h1 className="title">APPLE CERTIFICATE.</h1>
          <p className="subtitle">{t[lang].subtitle}</p>
        </header>

        {/* DNS Banner */}
        <a href="#" className="dns-banner glass" onClick={(e) => { e.preventDefault(); alert("Link tải file cấu hình chặn thu hồi"); }}>
          <div className="dns-info">
            <div className="dns-icon">
              <i className="fas fa-shield-alt"></i>
            </div>
            <div className="dns-text">
              <h4>{t[lang].dns}</h4>
              <p>{t[lang].dnsDesc}</p>
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
          {activeTab === 'esign' && esignData.map(renderAppCard)}
          {activeTab === 'cert' && certData.map(renderAppCard)}
          {activeTab === 'mods' && modsData.map(renderAppCard)}
        </main>
        
        {/* Footer */}
        <footer>
          <p>{t[lang].footerWait}</p>
          <p>&copy; 2026 CERTIOS.XYZ</p>
        </footer>
      </div>
    </>
  );
}

export default App;
