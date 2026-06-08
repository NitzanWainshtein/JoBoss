import React, { useState, useEffect } from 'react';
import ICON_SIZES from '../iconSizes';

export default function LocationInput({ value, onChange, onCoordinates }) {
  const [inputVal, setInputVal] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [timer, setTimer] = useState(null);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  const formatAddress = (item) => {
    const a = item.address || {};
    const parts = [];
    if (a.road) {
      parts.push(a.house_number ? `${a.road} ${a.house_number}` : a.road);
    }
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county;
    if (city && city !== a.road) parts.push(city);
    return parts.length ? parts.join(', ') : (item.display_name || '');
  };

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=5&countrycodes=il&addressdetails=1`,
        { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
      );
      const data = await res.json();
      setSuggestions(data.map(i => ({ place_id: i.place_id, description: formatAddress(i), latitude: i.lat, longitude: i.lon })));
    } catch { setSuggestions([]); }
  };

  const handleChange = (e) => {
    setInputVal(e.target.value);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fetchSuggestions(e.target.value), 500));
  };

  const handleSelect = (s) => {
    setInputVal(s.description);
    onChange?.(s.description);
    onCoordinates?.(s.latitude, s.longitude);
    setSuggestions([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        style={inputStyle}
        value={inputVal}
        onChange={handleChange}
        placeholder="הקלד עיר..."
      />
      {suggestions.length > 0 && (
        <div style={dropdownStyle}>
          {suggestions.map(s => (
            <div
              key={s.place_id}
              style={itemStyle}
              onClick={() => handleSelect(s)}
              onMouseEnter={e => e.currentTarget.style.background = '#F0F2FF'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <img src="/icons/location_icon.png" alt="" style={{ width: `${ICON_SIZES.locationDropdown}px`, height: `${ICON_SIZES.locationDropdown}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />{s.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: '12px',
  border: '1.5px solid #eee', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box', background: 'white',
};
const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
  borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  zIndex: 200, overflow: 'hidden', marginTop: '4px',
};
const itemStyle = {
  padding: '12px 16px', cursor: 'pointer', fontSize: '13px',
  borderBottom: '1px solid #f5f5f5',
};
