import { useState } from 'react';
import './App.css';

// Tạm thời dùng mock data, bạn có thể thay thế bằng API data sau
const mockCerts = [
  {
    id: 1,
    name: 'China Mobile Group',
    bundleId: 'com.chinamobile.group',
    status: 'active',
    date: '13-07-2026',
  },
  {
    id: 2,
    name: 'Hubei Bank Corporation',
    bundleId: 'com.hubeibank.ios',
    status: 'revoked',
    date: '10-07-2026',
  }
];

function App() {
  const [certs] = useState(mockCerts);

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="title">CERTIOS.XYZ</h1>
        <p className="subtitle">Free Enterprise Certificates</p>
      </header>

      <main className="cert-list">
        {certs.map((cert) => (
          <div key={cert.id} className="cert-card glass">
            <div className="cert-header">
              <div className="cert-icon">
                {cert.status === 'active' ? '✨' : '⚠️'}
              </div>
              <div className="cert-info">
                <h3>{cert.name}</h3>
                <p>{cert.bundleId}</p>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <div className={`status-badge ${cert.status}`}>
                <span className="status-dot"></span>
                {cert.status === 'active' ? 'Signed' : 'Revoked'}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                {cert.date}
              </span>
            </div>

            <button 
              className="btn-download" 
              onClick={() => alert('API Download chưa được tích hợp')}
              disabled={cert.status !== 'active'}
              style={{ opacity: cert.status === 'active' ? 1 : 0.5 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Tải Chứng Chỉ
            </button>
          </div>
        ))}
      </main>
      
      <footer style={{ textAlign: 'center', marginTop: 'auto', padding: '20px 0', fontSize: '13px', color: 'var(--secondary-text)' }}>
        <p>Giao diện chờ dữ liệu API của bạn.</p>
        <p>&copy; 2026 CERTIOS.XYZ</p>
      </footer>
    </div>
  );
}

export default App;
