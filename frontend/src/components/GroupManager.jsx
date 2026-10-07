import React, { useState, useEffect } from 'react';
import axios from 'axios';


const API_BASE_URL = 'http://localhost:5001/api';

export default function GroupManager({ token, user, onGroupUpdate, showToast }) {
  const [group, setGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  
  // Clusters selection
  const [buildings, setBuildings] = useState([]);
  const [targetBuildingId, setTargetBuildingId] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // Fetch current group on load
  const fetchGroup = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/groups/my-group`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGroup(res.data.group);
    } catch (err) {
      console.error('Failed to load group details', err);
    }
  };

  useEffect(() => {
    fetchGroup();
    // Load buildings list for cluster suggestions
    const fetchBuildings = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/rooms/buildings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBuildings(res.data);
        if (res.data.length > 0) {
          setTargetBuildingId(res.data[0]._id);
        }
      } catch (err) {
        console.error('Failed to load buildings', err);
      }
    };
    fetchBuildings();
  }, [token]);

  // Create Group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      showToast('Group name cannot be blank', 'info');
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE_URL}/groups/create`,
        { name: newGroupName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`Group '${res.data.name}' created!`, 'success');
      setNewGroupName('');
      fetchGroup();
      if (onGroupUpdate) onGroupUpdate();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create group', 'error');
    }
  };

  // Join Group
  const handleJoinGroup = async () => {
    if (!joinCode.trim()) {
      showToast('Join code cannot be blank', 'info');
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE_URL}/groups/join`,
        { code: joinCode.trim().toUpperCase() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`Successfully joined group!`, 'success');
      setJoinCode('');
      fetchGroup();
      if (onGroupUpdate) onGroupUpdate();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to join group', 'error');
    }
  };

  // Seal Group
  const handleSealGroup = async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/groups/seal`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(res.data.message, 'success');
      fetchGroup();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to seal group', 'error');
    }
  };

  // Fetch Suggestions
  const handleGetClusters = async () => {
    if (!targetBuildingId) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/groups/clusters/${targetBuildingId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuggestions(res.data.suggestions);
      if (res.data.suggestions.length === 0) {
        showToast('No matching consecutive room clusters found in this building.', 'info');
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to calculate clusters', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Group Info or Creation Board */}
      {!group ? (
        <div className="glass-light" style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          {/* Create Group Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid var(--border-color)', paddingRight: '2rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '1.05rem' }}>Start a group</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Create a group to coordinate room selection with friends. Once created, you will get a code to share.
              </p>
              <div className="form-group">
                <label>Group name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Quad Squad"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={handleCreateGroup}>Create group</button>
            </div>

          {/* Join Group Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '1.05rem' }}>Join a group</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Have a join code from a classmate? Enter it below to join their hostel allocation group.
              </p>
              <div className="form-group">
                <label>6-digit invite code</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AB12CD"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" style={{ background: 'var(--success-color)' }} onClick={handleJoinGroup}>Join group</button>
            </div>

        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Group Details */}
          <div className="glass-light" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: '1.4rem' }}>{group.name}</h3>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  Status: {group.status.toUpperCase()} &bull; Class: {user.category}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Invite code</label>
                  <code style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-color)', letterSpacing: '1px' }}>{group.code}</code>
                </div>
                {group.status === 'forming' && (
                  <button className="btn btn-primary" onClick={handleSealGroup}>
                    Seal group
                  </button>
                )}
              </div>
            </div>

            <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.8rem', color: 'var(--text-secondary)' }}>Members ({group.members.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {group.members.map(m => (
                <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{m.registerNumber}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cluster Suggestions for Sealed Groups */}
          {group.status === 'sealed' && (
            <div className="glass-light" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <div>
                  <h3 style={{ fontWeight: 700 }}>Adjacent Room Clusters</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Find wings that can fit all {group.members.length} members near each other.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    value={targetBuildingId}
                    onChange={(e) => setTargetBuildingId(e.target.value)}
                  >
                    {buildings.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={handleGetClusters}>
                    Find clusters
                  </button>
                </div>
              </div>

              {suggestions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {suggestions.map((s, idx) => (
                    <div key={idx} style={{ padding: '1.2rem', background: 'rgba(99,102,241,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--accent-color)', marginBottom: '0.3rem' }}>
                          Floor {s.floor}, Wing {s.wing}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Requires {s.roomsNeeded} adjacent rooms ({s.totalAvailableBeds} beds currently open).
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.rooms.map((rm, ridx) => (
                          <span key={ridx} style={{ padding: '0.3rem 0.6rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                            Room {rm.roomNumber} ({rm.openBeds} Open)
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  Click "Find Clusters" to search vacancy groupings.
                </div>
              )}

            </div>
          )}

        </div>
      )}

    </div>
  );
}
