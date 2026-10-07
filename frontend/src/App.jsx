import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SeatMap from './components/SeatMap';
import GroupManager from './components/GroupManager';
import WardenDashboard from './components/WardenDashboard';

// Bennett University Branding Assets
import bennettCampus from './assets/bennett-campus.jpg';
import bennettCrest from './assets/bennett-crest.png';

const API_BASE_URL = 'http://localhost:5001/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [authRole, setAuthRole] = useState('student'); // 'student' or 'warden'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regNum, setRegNum] = useState('');
  const [category, setCategory] = useState('UG');

  // Sidebar Tab Switching
  const [activeTab, setActiveTab] = useState('seatmap'); // 'seatmap' or 'groups'
  const [wardenTab, setWardenTab] = useState('dashboard'); // 'dashboard' or 'rules'

  // Custom Toast State
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Sync theme
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Handle Auth submission
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password || (!isLogin && authRole === 'student' && (!name || !regNum))) {
      showToast('Please fill in all required fields.', 'info');
      return;
    }

    try {
      let endpoint = '';
      let payload = {};

      if (isLogin) {
        endpoint = `${API_BASE_URL}/auth/${authRole}/login`;
        payload = { email, password };
      } else {
        endpoint = `${API_BASE_URL}/auth/${authRole}/register`;
        payload = authRole === 'student' 
          ? { name, registerNumber: regNum, email, password, category }
          : { name, email, password };
      }

      const res = await axios.post(endpoint, payload);
      const resData = res.data;
      
      const sessionUser = resData.user || resData.student || resData.warden;
      setToken(resData.token);
      setUser(sessionUser);
      localStorage.setItem('token', resData.token);
      localStorage.setItem('user', JSON.stringify(sessionUser));
      
      showToast(`Welcome back, ${sessionUser.name}!`, 'success');
      
      // Reset form states
      setName('');
      setEmail('');
      setPassword('');
      setRegNum('');
    } catch (err) {
      showToast(err.response?.data?.error || 'Authentication failed.', 'error');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showToast('Logged out successfully.', 'info');
  };

  // Refresh user state (such as group refs or booking states)
  const refreshUserState = async () => {
    if (!token || user.role !== 'student') return;
    try {
      // Re-login student info using cached ID by fetching profile if we had an endpoint
      // For now, let's query the group API to fetch active structures
      const res = await axios.get(`${API_BASE_URL}/groups/my-group`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.group) {
        setUser(prev => {
          const updated = { ...prev, groupRef: res.data.group._id };
          localStorage.setItem('user', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.warn('Failed to sync student session parameters.');
    }
  };

  return (
    <div>
      {/* Dynamic Navigation */}
      <header className="navbar glass-heavy">
        <div className="nav-logo">
          <img src={bennettCrest} className="logo-crest-img" alt="Bennett Logo" style={{ height: '36px', marginRight: '0.5rem' }} />
          <span>Bennett Hostel Portal</span>
        </div>
        <div className="nav-links">
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', color: '#111111' }}>{user.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  {user.role === 'student' ? `${user.category} Student` : 'Hostel Warden'}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Guest Authentication Screen */}
      {!user ? (
        <div className="auth-page">
          <div className="auth-card glass-heavy">

            <h2 style={{ fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
              {isLogin ? 'Sign In' : 'Create Account'}
            </h2>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Hostel Room Allocation Portal
            </p>

            {/* Role Switcher */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.3rem', marginBottom: '1.5rem' }}>
              <button
                className="btn"
                style={{ flex: 1, background: authRole === 'student' ? 'var(--accent-gradient)' : 'transparent', color: authRole === 'student' ? 'white' : 'var(--text-secondary)' }}
                onClick={() => setAuthRole('student')}
              >
                Student
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: authRole === 'warden' ? 'var(--accent-gradient)' : 'transparent', color: authRole === 'warden' ? 'white' : 'var(--text-secondary)' }}
                onClick={() => setAuthRole('warden')}
              >
                Warden
              </button>
            </div>

            <form onSubmit={handleAuth}>
              {!isLogin && (
                <div className="form-group">
                  <label>Full name</label>
                  <input type="text" className="form-input" placeholder="e.g. Aditi Sharma" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}

              {!isLogin && authRole === 'student' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Registration number</label>
                    <input type="text" className="form-input" placeholder="e.g. 20BCE0123" value={regNum} onChange={(e) => setRegNum(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="UG">UG (B.Tech)</option>
                      <option value="PG">PG (M.Tech)</option>
                      <option value="PhD">PhD Scholar</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Email address</label>
                <div style={{ position: 'relative' }}>
                  <input type="email" className="form-input" placeholder="name@bennett.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label>Password</label>
                <input type="password" className="form-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.8rem' }}>
                {isLogin ? 'Sign In' : 'Register Account'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '1.5rem' }}>
              {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
              <span style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setIsLogin(!isLogin)}>
                {isLogin ? 'Register' : 'Sign In'}
              </span>
            </p>
          </div>
        </div>
      ) : (
        /* Authenticated Layout */
        <div className="dashboard-container">
          
          {user && user.role === 'student' && (
            <div className="nav-tabs">
              <button
                className={`nav-tab-button ${activeTab === 'seatmap' ? 'active' : ''}`}
                onClick={() => setActiveTab('seatmap')}
              >
                Room Selection
              </button>
              <button
                className={`nav-tab-button ${activeTab === 'groups' ? 'active' : ''}`}
                onClick={() => setActiveTab('groups')}
              >
                Group Workspace
              </button>
            </div>
          )}

          {user && user.role === 'warden' && (
            <div className="nav-tabs">
              <button
                className={`nav-tab-button ${wardenTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setWardenTab('dashboard')}
              >
                Admin Dashboard
              </button>
              <button
                className={`nav-tab-button ${wardenTab === 'rules' ? 'active' : ''}`}
                onClick={() => setWardenTab('rules')}
              >
                Room Eligibility Rules
              </button>
            </div>
          )}

          {/* Main Panel */}
          <main className="main-content">
            {user.role === 'student' ? (
              activeTab === 'seatmap' ? (
                <SeatMap token={token} user={user} onBookingSuccess={refreshUserState} showToast={showToast} />
              ) : (
                <GroupManager token={token} user={user} onGroupUpdate={refreshUserState} showToast={showToast} />
              )
            ) : (
              <WardenDashboard token={token} showToast={showToast} activeSection={wardenTab} />
            )}
          </main>

        </div>
      )}

      {/* Reactive Toast Banners */}
      {toast && (
        <div className="toast" style={{
          background: toast.type === 'success' ? 'var(--success-color)' :
                      toast.type === 'error' ? 'var(--danger-color)' :
                      toast.type === 'info' ? 'var(--held-color)' : 'var(--accent-color)'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
