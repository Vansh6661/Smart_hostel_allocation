import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5001/api';

export default function WardenDashboard({ token, showToast, activeSection = 'dashboard' }) {
  const [stats, setStats] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [rules, setRules] = useState([]);

  // Drill-down states
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [buildingRooms, setBuildingRooms] = useState([]);
  const [roomDetails, setRoomDetails] = useState(null);
  const [selectedBed, setSelectedBed] = useState(null);

  // Student manual assignment search
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentSearchResults, setStudentSearchResults] = useState([]);
  const [selectedStudentToAssign, setSelectedStudentToAssign] = useState(null);

  // Building form
  const [bName, setBName] = useState('');
  const [bFloors, setBFloors] = useState('');
  const [bGender, setBGender] = useState('boys');
  const [bDesc, setBDesc] = useState('');

  // Room form
  const [rNum, setRNum] = useState('');
  const [rBuildingId, setRBuildingId] = useState('');
  const [rFloor, setRFloor] = useState('');
  const [rWing, setRWing] = useState('');
  const [rCategory, setRCategory] = useState('UG');
  const [rCapacity, setRCapacity] = useState('3');

  const fetchStatsAndBuildings = async () => {
    try {
      const statsRes = await axios.get(`${API_BASE_URL}/rooms/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(statsRes.data);

      const buildingsRes = await axios.get(`${API_BASE_URL}/rooms/buildings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBuildings(buildingsRes.data);
      if (buildingsRes.data.length > 0 && !rBuildingId) {
        setRBuildingId(buildingsRes.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to load warden stats', err);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/warden/rules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRules(res.data);
    } catch (err) {
      console.error('Failed to load category capacity rules', err);
    }
  };

  useEffect(() => {
    fetchStatsAndBuildings();
    fetchRules();
  }, [token]);

  useEffect(() => {
    if (rules.length > 0) {
      const activeRule = rules.find(r => r.category === rCategory);
      if (activeRule && activeRule.allowedCapacities.length > 0) {
        const allowed = activeRule.allowedCapacities;
        const currentString = rCapacity === '1' ? 'single' : rCapacity === '2' ? 'double' : rCapacity === '3' ? 'triple' : '';
        if (!allowed.includes(currentString)) {
          const firstAllowed = allowed[0];
          const firstAllowedValue = firstAllowed === 'single' ? '1' : firstAllowed === 'double' ? '2' : '3';
          setRCapacity(firstAllowedValue);
        }
      } else {
        setRCapacity('');
      }
    }
  }, [rCategory, rules]);

  useEffect(() => {
    setSelectedBuilding(null);
    setSelectedRoom(null);
    setSelectedBed(null);
  }, [activeSection]);

  const handleSelectBuilding = async (bStats) => {
    setSelectedBuilding(bStats);
    setSelectedRoom(null);
    setSelectedBed(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/warden/buildings/${bStats.buildingId}/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBuildingRooms(res.data);
    } catch (err) {
      showToast('Failed to load building rooms: ' + err.message, 'error');
    }
  };

  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    setSelectedBed(null);
    await fetchRoomDetails(room._id);
  };

  const fetchRoomDetails = async (roomId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/warden/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoomDetails(res.data);
    } catch (err) {
      showToast('Failed to load room details: ' + err.message, 'error');
    }
  };

  const handleStudentSearch = async (query) => {
    setStudentSearchQuery(query);
    setSelectedStudentToAssign(null);
    if (!query.trim()) {
      setStudentSearchResults([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE_URL}/warden/students/search?query=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudentSearchResults(res.data);
    } catch (err) {
      console.error('Student search error', err);
    }
  };

  const handleAssignStudent = async () => {
    if (!selectedStudentToAssign || !selectedBed || !selectedRoom) return;
    try {
      const res = await axios.post(
        `${API_BASE_URL}/warden/rooms/${selectedRoom._id}/beds/${selectedBed.bedNumber}/assign`,
        { studentId: selectedStudentToAssign._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Student assigned successfully.', 'success');
      setRoomDetails(res.data.room);
      const updatedBed = res.data.room.beds.find(b => b.bedNumber === selectedBed.bedNumber);
      setSelectedBed(updatedBed);
      setStudentSearchQuery('');
      setStudentSearchResults([]);
      setSelectedStudentToAssign(null);
      fetchStatsAndBuildings();
    } catch (err) {
      showToast('Failed to assign: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const handleRemoveStudent = async () => {
    if (!selectedBed || !selectedRoom) return;
    try {
      const res = await axios.post(
        `${API_BASE_URL}/warden/rooms/${selectedRoom._id}/beds/${selectedBed.bedNumber}/remove`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Student removed from bed.', 'success');
      setRoomDetails(res.data.room);
      const updatedBed = res.data.room.beds.find(b => b.bedNumber === selectedBed.bedNumber);
      setSelectedBed(updatedBed);
      fetchStatsAndBuildings();
    } catch (err) {
      showToast('Could not remove student: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const handleCreateBuilding = async (e) => {
    e.preventDefault();
    if (!bName || !bFloors) {
      showToast('Block name and floors are required.', 'info');
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/warden/buildings`,
        { name: bName, totalFloors: parseInt(bFloors), genderRestriction: bGender, description: bDesc },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Block created.', 'success');
      setBName(''); setBFloors(''); setBDesc('');
      fetchStatsAndBuildings();
    } catch (err) {
      showToast('Failed to create block: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!rNum || !rBuildingId || !rFloor || !rCapacity) {
      showToast('Room number, block, floor and capacity are required.', 'info');
      return;
    }
    try {
      await axios.post(
        `${API_BASE_URL}/warden/rooms`,
        {
          roomNumber: rNum,
          buildingId: rBuildingId,
          floor: parseInt(rFloor),
          wing: rWing.toUpperCase(),
          category: rCategory,
          capacity: parseInt(rCapacity)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast(`Room ${rNum} created.`, 'success');
      setRNum(''); setRWing(''); setRFloor('');
      fetchStatsAndBuildings();
    } catch (err) {
      showToast('Failed to create room: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/warden/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Hostel_Allocation_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Excel report downloaded.', 'success');
    } catch (err) {
      showToast('Export failed.', 'error');
    }
  };

  const handleExportPDF = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/warden/export-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Hostel_Allocation_Executive_Summary.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('PDF summary downloaded.', 'success');
    } catch (err) {
      showToast('PDF export failed.', 'error');
    }
  };

  const handleSaveRules = async () => {
    try {
      await axios.post(
        `${API_BASE_URL}/warden/rules`,
        { rules },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast('Rules saved.', 'success');
      fetchRules();
    } catch (err) {
      showToast('Failed to save rules.', 'error');
    }
  };

  const handleToggleRule = (category, capacityType) => {
    setRules(prev => prev.map(r => {
      if (r.category === category) {
        const alreadyAllowed = r.allowedCapacities.includes(capacityType);
        const updatedCapacities = alreadyAllowed
          ? r.allowedCapacities.filter(c => c !== capacityType)
          : [...r.allowedCapacities, capacityType];
        return { ...r, allowedCapacities: updatedCapacities };
      }
      return r;
    }));
  };

  const activeRuleForAddRoom = rules.find(r => r.category === rCategory);
  const allowedCapacities = activeRuleForAddRoom ? activeRuleForAddRoom.allowedCapacities : [];

  const totalBuildings = stats.length;
  const totalBeds = stats.reduce((acc, s) => acc + s.totalBeds, 0);
  const totalBooked = stats.reduce((acc, s) => acc + s.bookedBeds, 0);
  const totalHeld = stats.reduce((acc, s) => acc + s.heldBeds, 0);
  const overallOccupancy = totalBeds > 0 ? Math.round((totalBooked / totalBeds) * 100) : 0;

  // ─── Room Eligibility Rules Screen ────────────────────────────────────────
  if (activeSection === 'rules') {
    return (
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="uni-card" style={{ padding: '2rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.4rem', marginBottom: '0.3rem' }}>Room Eligibility Rules</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Control which room sharing types each student category can apply for. Changes take effect immediately after saving.
          </p>
        </div>

        <div className="uni-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem' }}>
            {['UG', 'PG', 'PhD'].map(cat => {
              const rule = rules.find(r => r.category === cat) || { category: cat, allowedCapacities: [] };
              const label = cat === 'UG' ? 'Undergraduate (B.Tech)' : cat === 'PG' ? 'Postgraduate (M.Tech)' : 'Doctoral (PhD)';
              return (
                <div key={cat} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '1rem', color: '#111' }}>{label}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Code: {cat}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '2rem' }}>
                    {['single', 'double', 'triple'].map(type => (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          checked={rule.allowedCapacities.includes(type)}
                          onChange={() => handleToggleRule(cat, type)}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{type} sharing</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={handleSaveRules} style={{ padding: '0.7rem 2rem' }}>
              Save changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Level 2: Room beds view ───────────────────────────────────────────────
  if (selectedRoom) {
    return (
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ cursor: 'pointer', color: '#2563EB', fontWeight: 500 }} onClick={() => { setSelectedBuilding(null); setSelectedRoom(null); setSelectedBed(null); }}>
            Warden Panel
          </span>
          <span>/</span>
          <span style={{ cursor: 'pointer', color: '#2563EB', fontWeight: 500 }} onClick={() => { setSelectedRoom(null); setSelectedBed(null); }}>
            {selectedBuilding.name}
          </span>
          <span>/</span>
          <span style={{ fontWeight: 600, color: '#111' }}>Room {selectedRoom.roomNumber}</span>
        </div>

        <button className="btn btn-secondary" style={{ width: 'fit-content' }} onClick={() => { setSelectedRoom(null); setSelectedBed(null); }}>
          ← Back to rooms
        </button>

        {roomDetails && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <div className="uni-card" style={{ padding: '2rem' }}>
              <h3 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '1.5rem', color: '#111' }}>Bed layout</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', gap: '1.5rem', flexWrap: 'wrap' }}>
                {roomDetails.beds.map(bed => {
                  const isSelected = selectedBed && selectedBed.bedNumber === bed.bedNumber;
                  return (
                    <div
                      key={bed._id}
                      className={`bed-node ${bed.status}`}
                      style={{
                        minWidth: '90px',
                        padding: '1.2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        outline: isSelected ? '2px solid #2563EB' : 'none',
                        outlineOffset: '2px',
                        transform: isSelected ? 'scale(1.04)' : 'none',
                      }}
                      onClick={() => setSelectedBed(bed)}
                    >
                      <span style={{ fontSize: '1.4rem' }}>🛏</span>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>{bed.bedNumber.split('-')[1]}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 500, textTransform: 'capitalize' }}>{bed.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="uni-card" style={{ padding: '2rem' }}>
              {selectedBed ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  <div>
                    <h3 style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111' }}>
                      Bed {selectedBed.bedNumber.split('-')[1]}
                    </h3>
                    <p style={{
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      color: selectedBed.status === 'booked' ? 'var(--danger-color)' : selectedBed.status === 'held' ? 'var(--held-color)' : 'var(--success-color)',
                      marginTop: '0.2rem'
                    }}>
                      {selectedBed.status}
                    </p>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

                  {selectedBed.status === 'open' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111' }}>Assign a student</h4>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Search by name or registration number</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Aditi or 20BCE0123"
                          value={studentSearchQuery}
                          onChange={(e) => handleStudentSearch(e.target.value)}
                        />
                      </div>

                      {studentSearchResults.length > 0 && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', background: '#fff' }}>
                          {studentSearchResults.map(std => (
                            <div
                              key={std._id}
                              style={{ padding: '0.6rem 0.8rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: '0.85rem' }}
                              onClick={() => {
                                setSelectedStudentToAssign(std);
                                setStudentSearchQuery(`${std.name} (${std.registerNumber})`);
                                setStudentSearchResults([]);
                              }}
                            >
                              <p style={{ fontWeight: 600, color: '#111' }}>{std.name}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{std.registerNumber} · {std.category}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedStudentToAssign && (
                        <div style={{ padding: '0.75rem', background: '#EFF3FF', borderRadius: '8px', fontSize: '0.85rem', color: '#1D4ED8' }}>
                          <p style={{ fontWeight: 600 }}>{selectedStudentToAssign.name}</p>
                          <p style={{ fontSize: '0.75rem', opacity: 0.85 }}>{selectedStudentToAssign.registerNumber}</p>
                        </div>
                      )}

                      <button
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={!selectedStudentToAssign}
                        onClick={handleAssignStudent}
                      >
                        Assign to this bed
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Occupied by</p>
                        <p style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111' }}>
                          {selectedBed.studentRef?.name || 'Unknown student'}
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {selectedBed.studentRef?.registerNumber || '—'}
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {selectedBed.studentRef?.email || '—'}
                        </p>
                      </div>
                      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />
                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', color: 'var(--danger-color)', borderColor: '#FECACA' }}
                        onClick={handleRemoveStudent}
                      >
                        Remove student from bed
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '2rem 0', lineHeight: 1.6 }}>
                  Select a bed to view details or make changes.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Level 1: Building rooms list ─────────────────────────────────────────
  if (selectedBuilding) {
    const roomsByFloor = {};
    buildingRooms.forEach(room => {
      if (!roomsByFloor[room.floor]) roomsByFloor[room.floor] = [];
      roomsByFloor[room.floor].push(room);
    });
    const sortedFloors = Object.keys(roomsByFloor).sort((a, b) => parseInt(a) - parseInt(b));

    return (
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ cursor: 'pointer', color: '#2563EB', fontWeight: 500 }} onClick={() => { setSelectedBuilding(null); setSelectedRoom(null); }}>
            Warden Panel
          </span>
          <span>/</span>
          <span style={{ fontWeight: 600, color: '#111' }}>{selectedBuilding.name}</span>
        </div>

        <button className="btn btn-secondary" style={{ width: 'fit-content' }} onClick={() => { setSelectedBuilding(null); setSelectedRoom(null); setSelectedBed(null); }}>
          ← Back to overview
        </button>

        <div className="uni-card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.3rem', color: '#111' }}>Rooms in {selectedBuilding.name}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Click any room to view individual bed assignments.</p>
        </div>

        {buildingRooms.length === 0 ? (
          <div className="uni-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No rooms have been added to this block yet.
          </div>
        ) : (
          sortedFloors.map(floorNum => (
            <div key={floorNum}>
              <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Floor {floorNum}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {roomsByFloor[floorNum].map(room => {
                  const bookedCount = room.beds.filter(b => b.status === 'booked').length;
                  const totalCount = room.capacity;
                  const pct = totalCount > 0 ? Math.round((bookedCount / totalCount) * 100) : 0;
                  return (
                    <div
                      key={room._id}
                      className="uni-card"
                      style={{ padding: '1.2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
                      onClick={() => handleSelectRoom(room)}
                    >
                      <h4 style={{ fontWeight: 600, fontSize: '1rem', color: '#111' }}>Room {room.roomNumber}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Wing {room.wing || '—'} · {room.category}
                      </p>
                      <div className="occ-bar-track" style={{ marginTop: '0.3rem' }}>
                        <div className="occ-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {bookedCount} of {totalCount} beds occupied
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ─── Level 0: Main dashboard ───────────────────────────────────────────────
  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header + export actions */}
      <div className="uni-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: '1.5rem', color: '#111' }}>Warden Administrator Panel</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Digital hostel room allocation — replacing manual, Excel-based assignment
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportPDF}>
            Export summary (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportExcel}>
            Export allocation report
          </button>
        </div>
      </div>

      {/* Summary stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total blocks', value: totalBuildings, color: '#111' },
          { label: 'Total beds', value: totalBeds, color: '#111' },
          { label: 'Booked', value: totalBooked, color: 'var(--success-color)' },
          { label: 'Held', value: totalHeld, color: 'var(--held-color)' },
          { label: 'Overall occupancy', value: `${overallOccupancy}%`, color: '#2563EB' },
        ].map(stat => (
          <div key={stat.label} className="uni-card" style={{ padding: '1.2rem' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{stat.label}</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color, lineHeight: 1.1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Occupancy per block — horizontal progress bars */}
      <div className="uni-card" style={{ padding: '2rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '1rem', color: '#111', marginBottom: '1.5rem' }}>
          Occupancy by block
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {stats.map(s => (
            <div key={s.buildingId} className="occ-bar-row">
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
                {s.name.replace('Block ', '')}
              </span>
              <div className="occ-bar-track">
                <div className="occ-bar-fill" style={{ width: `${s.occupancyRate}%` }} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#2563EB', textAlign: 'right' }}>
                {s.occupancyRate}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Building cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.2rem' }}>
        {stats.map(s => (
          <div
            key={s.buildingId}
            className="uni-card"
            style={{ padding: '1.4rem', cursor: 'pointer' }}
            onClick={() => handleSelectBuilding(s)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
              <h4 style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111' }}>{s.name}</h4>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563EB', background: '#EFF3FF', padding: '0.2rem 0.6rem', borderRadius: '99px' }}>
                {s.occupancyRate}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
              <span>Total beds: <strong style={{ color: '#111' }}>{s.totalBeds}</strong></span>
              <span>Booked: <strong style={{ color: 'var(--success-color)' }}>{s.bookedBeds}</strong></span>
              <span>Held: <strong style={{ color: 'var(--held-color)' }}>{s.heldBeds}</strong></span>
              <span>Available: <strong style={{ color: '#111' }}>{s.totalBeds - s.bookedBeds - s.heldBeds}</strong></span>
            </div>
            <div className="occ-bar-track">
              <div className="occ-bar-fill" style={{ width: `${s.occupancyRate}%` }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 500, marginTop: '0.8rem' }}>
              View rooms →
            </p>
          </div>
        ))}
      </div>

      {/* CRUD forms */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        <div className="uni-card" style={{ padding: '2rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '1.2rem', color: '#111' }}>Add a block</h3>
          <form onSubmit={handleCreateBuilding} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Block name</label>
              <input type="text" className="form-input" placeholder="e.g. Block C-1" value={bName} onChange={(e) => setBName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Total floors</label>
                <input type="number" className="form-input" placeholder="e.g. 4" value={bFloors} onChange={(e) => setBFloors(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Gender restriction</label>
                <select className="form-input" value={bGender} onChange={(e) => setBGender(e.target.value)}>
                  <option value="boys">Boys only</option>
                  <option value="girls">Girls only</option>
                  <option value="coed">Co-ed</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input type="text" className="form-input" placeholder="e.g. UG freshers block" value={bDesc} onChange={(e) => setBDesc(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">Create block</button>
          </form>
        </div>

        <div className="uni-card" style={{ padding: '2rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '1.2rem', color: '#111' }}>Add a room</h3>
          <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Room number</label>
                <input type="text" className="form-input" placeholder="e.g. 101" value={rNum} onChange={(e) => setRNum(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Block</label>
                <select className="form-input" value={rBuildingId} onChange={(e) => setRBuildingId(e.target.value)}>
                  {buildings.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Floor</label>
                <input type="number" className="form-input" placeholder="e.g. 1" value={rFloor} onChange={(e) => setRFloor(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Wing (optional)</label>
                <input type="text" className="form-input" placeholder="e.g. A" value={rWing} onChange={(e) => setRWing(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Student category</label>
                <select className="form-input" value={rCategory} onChange={(e) => setRCategory(e.target.value)}>
                  <option value="UG">UG (B.Tech)</option>
                  <option value="PG">PG (M.Tech)</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>
              <div className="form-group">
                <label>Room capacity</label>
                <select className="form-input" value={rCapacity} onChange={(e) => setRCapacity(e.target.value)}>
                  {allowedCapacities.includes('single') && <option value="1">Single</option>}
                  {allowedCapacities.includes('double') && <option value="2">Double</option>}
                  {allowedCapacities.includes('triple') && <option value="3">Triple</option>}
                  {allowedCapacities.length === 0 && <option value="">No capacities allowed</option>}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Create room</button>
          </form>
        </div>

      </div>
    </div>
  );
}
