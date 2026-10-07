import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';


const API_BASE_URL = 'http://localhost:5001/api';

export default function SeatMap({ token, user, onBookingSuccess, showToast }) {
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [rooms, setRooms] = useState([]);
  const [socket, setSocket] = useState(null);
  
  // Hold state
  const [activeHold, setActiveHold] = useState(null);
  const [holdTimer, setHoldTimer] = useState(0);

  // Load buildings
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/rooms/buildings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBuildings(res.data);
        if (res.data.length > 0) {
          setSelectedBuilding(res.data[0]);
        }
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to fetch buildings', 'error');
      }
    };
    fetchBuildings();
  }, [token]);

  // Verify active booking from the server on mount (not from stale localStorage)
  useEffect(() => {
    const syncBookingStatus = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const freshProfile = res.data;
        if (freshProfile.bookedBed && freshProfile.bookedBed.bedNumber) {
          setActiveHold({ status: 'confirmed', bedNumber: freshProfile.bookedBed.bedNumber });
        } else {
          // Warden may have removed the booking — clear any stale confirmed state
          setActiveHold(null);
        }
        // Update localStorage with fresh data so rest of app stays in sync
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        const updated = { ...stored, bookedBed: freshProfile.bookedBed || null };
        localStorage.setItem('user', JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not sync booking status from server.');
      }
    };
    syncBookingStatus();
  }, [token]);

  // Load rooms when building or floor changes
  useEffect(() => {
    if (!selectedBuilding) return;

    const fetchRooms = async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/rooms/layout/${selectedBuilding._id}/${selectedFloor}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRooms(res.data);
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to fetch room layouts', 'error');
      }
    };
    fetchRooms();
  }, [selectedBuilding, selectedFloor, token]);

  // Setup Socket Connection
  useEffect(() => {
    if (!selectedBuilding) return;

    const socketUrl = 'http://localhost:5001';
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    // Join room channel
    newSocket.emit('joinRoomFloor', {
      buildingId: selectedBuilding._id,
      floor: selectedFloor
    });

    // Listen to real-time bed changes
    newSocket.on('bedStatusChanged', ({ roomId, bedNumber, status, studentRef }) => {
      setRooms((prevRooms) =>
        prevRooms.map((room) => {
          if (room._id === roomId) {
            return {
              ...room,
              beds: room.beds.map((bed) => {
                if (bed.bedNumber === bedNumber) {
                  return { ...bed, status, studentRef };
                }
                return bed;
              })
            };
          }
          return room;
        })
      );

      // If the warden just freed up this student's confirmed bed, clear the hold
      setActiveHold((currentHold) => {
        if (currentHold && currentHold.status === 'confirmed' && currentHold.bedNumber === bedNumber && status === 'open') {
          // Clear stale bookedBed from localStorage as well
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          localStorage.setItem('user', JSON.stringify({ ...stored, bookedBed: null }));
          return null;
        }
        return currentHold;
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, [selectedBuilding, selectedFloor]);

  // Hold Timer countdown hook
  useEffect(() => {
    if (holdTimer <= 0) {
      if (activeHold && activeHold.status === 'pending') {
        setActiveHold(null);
        showToast('Your bed hold time expired.', 'info');
      }
      return;
    }
    const interval = setInterval(() => {
      setHoldTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [holdTimer, activeHold]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Trigger Hold
  const handleBedClick = async (room, bed) => {
    if (bed.status !== 'open') return;
    if (activeHold) {
      showToast('You already have a bed lock. Confirm or release it first.', 'info');
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE_URL}/booking/hold`,
        { roomId: room._id, bedNumber: bed.bedNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setActiveHold({
        roomId: room._id,
        bedNumber: bed.bedNumber,
        status: 'pending'
      });
      setHoldTimer(300); // 5 minutes timer
      showToast(res.data.message, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to secure bed hold', 'error');
    }
  };

  // Confirm Booking
  const handleConfirmBooking = async () => {
    if (!activeHold) return;

    try {
      const res = await axios.post(
        `${API_BASE_URL}/booking/confirm`,
        { roomId: activeHold.roomId, bedNumber: activeHold.bedNumber },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setActiveHold((prev) => ({ ...prev, status: 'confirmed' }));
      setHoldTimer(0);
      showToast(res.data.message, 'success');
      if (onBookingSuccess) {
        onBookingSuccess();
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to confirm booking', 'error');
    }
  };

  // Release Hold
  const handleReleaseHold = async () => {
    try {
      await axios.post(
        `${API_BASE_URL}/booking/release`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveHold(null);
      setHoldTimer(0);
      showToast('Hold released successfully.', 'info');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to release hold', 'error');
    }
  };

  return (
    <div className="main-content">
      {/* 1. Interactive Top Controls */}
      <div className="glass-light" style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Block</label>
            <select
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              value={selectedBuilding ? selectedBuilding._id : ''}
              onChange={(e) => setSelectedBuilding(buildings.find(b => b._id === e.target.value))}
            >
              {buildings.map(b => (
                <option key={b._id} value={b._id}>{b.name} ({b.genderRestriction.toUpperCase()})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Floor</label>
            <select
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(parseInt(e.target.value))}
            >
              {selectedBuilding && Array.from({ length: selectedBuilding.totalFloors }, (_, i) => i + 1).map(f => (
                <option key={f} value={f}>Floor {f}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.2rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--success-color)' }}></span>
            <span>Open ({user.category} only)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid var(--held-color)' }}></span>
            <span>Held</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger-color)' }}></span>
            <span>Booked</span>
          </div>
        </div>
      </div>

      {/* 2. Active Hold Actions Bar */}
      {activeHold && (
        <div className="glass-light" style={{ padding: '1.2rem 1.5rem', borderLeft: '4px solid var(--held-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <p style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                {activeHold.status === 'confirmed' ? 'Room Allocation Confirmed' : `Bed Hold: ${activeHold.bedNumber}`}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {activeHold.status === 'confirmed'
                  ? 'Your allocation is locked successfully.'
                  : `Please confirm your choice. It will release in ${formatTimer(holdTimer)}.`}
              </p>
            </div>
          </div>

          {activeHold.status === 'pending' && (
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button className="btn btn-secondary" onClick={handleReleaseHold}>Release</button>
              <button className="btn btn-primary" onClick={handleConfirmBooking}>Confirm Reservation</button>
            </div>
          )}
        </div>
      )}

      {/* 3. Room & Bed Canvas - Performance optimized light glass cards */}
      {rooms.length === 0 ? (
        <div className="glass-light" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No rooms found matching your category ({user.category}) on this floor.
        </div>
      ) : (
        <div className="room-grid">
          {rooms.map((room) => (
            <div key={room._id} className="glass-light room-card">
              <div className="room-header">
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Room {room.roomNumber}</h4>
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    Wing {room.wing || 'Main'} &bull; {room.category}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {room.beds.filter(b => b.status === 'open').length} / {room.capacity} Available
                </div>
              </div>

              {/* Beds selection interface */}
              <div className="bed-container">
                {room.beds.map((bed) => {
                  const isUserHeld = activeHold && activeHold.bedNumber === bed.bedNumber;
                  const displayStatus = isUserHeld ? 'held' : bed.status;

                  return (
                    <div
                      key={bed._id}
                      className={`bed-node ${displayStatus}`}
                      onClick={() => handleBedClick(room, bed)}
                    >
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>{bed.bedNumber.split('-')[1]}</span>
                      <span style={{ fontSize: '0.7rem', marginTop: '0.2rem', textTransform: 'capitalize' }}>
                        {displayStatus}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
