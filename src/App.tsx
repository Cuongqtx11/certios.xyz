import { useState } from 'react';
import './App.css';

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

  const handleDownload = (appName: string) => {
    alert(`Chức năng tải [${appName}] chưa được tích hợp.`);
  };

  const renderAppCard = (app: any) => (
    <div key={app.id} className="app-card glass">
      <div className="app-header">
        <div className="app-icon">
          {activeTab === 'esign' && <i className="fas fa-signature"></i>}
          {activeTab === 'cert' && <i className="fas fa-certificate"></i>}
          {activeTab === 'mods' && <i className="fas fa-gamepad"></i>}
        </div>
        <div className="app-info">
          <h3>{app.name}</h3>
          <p>{app.developer}</p>
          <div className="app-badges">
            <span className="badge">{app.size}</span>
            <span className={`badge ${app.status}`}>
              {app.status === 'active' ? 'Signed' : 'Revoked'}
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
        <i className="fas fa-download"></i> NHẬN
      </button>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1 className="title">CERTIOS.XYZ</h1>
        <p className="subtitle">Free Enterprise Certificates</p>
      </header>

      {/* DNS Banner */}
      <a href="#" className="dns-banner glass" onClick={(e) => { e.preventDefault(); alert("Link tải file cấu hình chặn thu hồi"); }}>
        <div className="dns-info">
          <div className="dns-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <div className="dns-text">
            <h4>DNS Chặn Thu Hồi</h4>
            <p>Cài cấu hình để sử dụng ESign an toàn</p>
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
        <p>Giao diện chờ dữ liệu API của bạn.</p>
        <p>&copy; 2026 CERTIOS.XYZ</p>
      </footer>
    </div>
  );
}

export default App;
