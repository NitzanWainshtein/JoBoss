import React from 'react';

function Spinner({ text = 'טוען...' }) {
  return (
    <div style={styles.container}>
      <div style={styles.spinner} />
      <p style={styles.text}>{text}</p>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
  spinner: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '4px solid #FFE0E0',
    borderTop: '4px solid #FF6B6B',
    animation: 'spin 0.8s linear infinite',
  },
  text: { color: '#FF6B6B', fontWeight: 600, fontSize: '14px', margin: 0 }
};

// הוספת keyframe animation
const styleSheet = document.createElement('style');
styleSheet.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Spinner;