
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
    width: '40px', height: '40px', borderRadius: '50%',
    border: '4px solid #D4CCFF',
    borderTop: '4px solid #6C4FD4',
    animation: 'spin 0.8s linear infinite',
  },
  text: { color: '#6C4FD4', fontWeight: 600, fontSize: '14px', margin: 0 }
};

const styleSheet = document.createElement('style');
styleSheet.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default Spinner;