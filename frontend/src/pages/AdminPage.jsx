import React, { useState } from 'react';
import { motion } from 'framer-motion';

const mockUsers = [
  { id: '1', name: 'ניצן וינשטיין', email: 'nitzan@test.com', plan: 'premium', applications: 12 },
  { id: '2', name: 'אביב עוז', email: 'aviv@test.com', plan: 'free', applications: 5 },
  { id: '3', name: 'רונן צ׳רשניה', email: 'ronen@test.com', plan: 'free', applications: 3 },
  { id: '4', name: 'משתמש דמו', email: 'demo@test.com', plan: 'free', applications: 8 },
];

const mockJobs = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', location: 'Tel Aviv', active: true },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', location: 'Herzliya', active: true },
  { jobId: '3', company: 'Monday.com', title: 'React Developer', location: 'Tel Aviv', active: false },
];

function AdminPage() {
  const [tab, setTab] = useState('users');
  const [jobs, setJobs] = useState(mockJobs);
  const [newJob, setNewJob] = useState({ company: '', title: '', location: '', salary: '' });
  const [showAddJob, setShowAddJob] = useState(false);

  const toggleJob = (jobId) => {
    setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, active: !j.active } : j));
  };

  const deleteJob = (jobId) => {
    setJobs(prev => prev.filter(j => j.jobId !== jobId));
  };

  const addJob = () => {
    if (!newJob.company || !newJob.title) return;
    setJobs(prev => [...prev, { ...newJob, jobId: Date.now().toString(), active: true }]);
    setNewJob({ company: '', title: '', location: '', salary: '' });
    setShowAddJob(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        {/* כותרת */}
        <div style={styles.pageHeader}>
          <h2 style={styles.pageTitle}>🛠️ פאנל ניהול</h2>
          <span style={styles.adminBadge}>Admin</span>
        </div>

        {/* סטטיסטיקות */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{mockUsers.length}</p>
            <p style={styles.statLabel}>משתמשים</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#4CAF50' }}>
              {mockUsers.filter(u => u.plan === 'premium').length}
            </p>
            <p style={styles.statLabel}>פרימיום</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#FF6B6B' }}>{jobs.length}</p>
            <p style={styles.statLabel}>משרות</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#FF8E53' }}>
              {mockUsers.reduce((sum, u) => sum + u.applications, 0)}
            </p>
            <p style={styles.statLabel}>הגשות</p>
          </div>
        </div>

        {/* טאבים */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'users' ? styles.tabActive : {}) }}
            onClick={() => setTab('users')}
          >
            👥 משתמשים
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'jobs' ? styles.tabActive : {}) }}
            onClick={() => setTab('jobs')}
          >
            💼 משרות
          </button>
        </div>

        {/* תוכן טאב משתמשים */}
        {tab === 'users' && (
          <div style={styles.list}>
            {mockUsers.map((user) => (
              <motion.div
                key={user.id}
                style={styles.card}
                whileHover={{ scale: 1.01 }}
              >
                <div style={styles.userAvatar}>
                  {user.name.charAt(0)}
                </div>
                <div style={styles.cardInfo}>
                  <p style={styles.cardTitle}>{user.name}</p>
                  <p style={styles.cardSubtitle}>{user.email}</p>
                  <p style={styles.cardSubtitle}>{user.applications} הגשות</p>
                </div>
                <span style={{
                  ...styles.planBadge,
                  background: user.plan === 'premium' ? '#FF6B6B' : '#eee',
                  color: user.plan === 'premium' ? 'white' : '#666'
                }}>
                  {user.plan === 'premium' ? '⭐ פרימיום' : 'חינמי'}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* תוכן טאב משרות */}
        {tab === 'jobs' && (
          <div style={styles.list}>
            <button style={styles.addBtn} onClick={() => setShowAddJob(!showAddJob)}>
              + הוסף משרה
            </button>

            {showAddJob && (
              <motion.div
                style={styles.addJobForm}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <input style={styles.input} placeholder="חברה" value={newJob.company}
                  onChange={e => setNewJob({ ...newJob, company: e.target.value })} />
                <input style={styles.input} placeholder="תפקיד" value={newJob.title}
                  onChange={e => setNewJob({ ...newJob, title: e.target.value })} />
                <input style={styles.input} placeholder="מיקום" value={newJob.location}
                  onChange={e => setNewJob({ ...newJob, location: e.target.value })} />
                <input style={styles.input} placeholder="שכר" value={newJob.salary}
                  onChange={e => setNewJob({ ...newJob, salary: e.target.value })} />
                <button style={styles.saveBtn} onClick={addJob}>שמור</button>
              </motion.div>
            )}

            {jobs.map((job) => (
              <motion.div
                key={job.jobId}
                style={{ ...styles.card, opacity: job.active ? 1 : 0.5 }}
                whileHover={{ scale: 1.01 }}
              >
                <div style={styles.cardInfo}>
                  <p style={styles.cardTitle}>{job.title}</p>
                  <p style={styles.cardSubtitle}>{job.company} · {job.location}</p>
                </div>
                <div style={styles.jobActions}>
                  <button
                    style={{ ...styles.actionBtn, background: job.active ? '#FFC107' : '#4CAF50', color: 'white' }}
                    onClick={() => toggleJob(job.jobId)}
                  >
                    {job.active ? 'השבת' : 'הפעל'}
                  </button>
                  <button
                    style={{ ...styles.actionBtn, background: '#F44336', color: 'white' }}
                    onClick={() => deleteJob(job.jobId)}
                  >
                    מחק
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)' },
  content: { padding: '24px', maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  pageHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  pageTitle: { fontSize: '24px', fontWeight: 800, margin: 0 },
  adminBadge: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' },
  statCard: { background: 'white', borderRadius: '16px', padding: '20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statNumber: { fontSize: '32px', fontWeight: 800, color: 'var(--primary)', margin: 0 },
  statLabel: { fontSize: '12px', color: 'var(--text-light)', margin: '4px 0 0 0' },
  tabs: { display: 'flex', gap: '8px', background: 'white', padding: '8px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  tab: { flex: 1, padding: '10px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', background: 'transparent', color: '#777' },
  tabActive: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: 'white', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  userAvatar: { width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px', fontWeight: 800, color: 'white', flexShrink: 0 },
  cardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  cardTitle: { fontSize: '15px', fontWeight: 700, margin: 0 },
  cardSubtitle: { fontSize: '13px', color: '#777', margin: 0 },
  planBadge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, flexShrink: 0 },
  jobActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  actionBtn: { padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' },
  addBtn: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '15px' },
  addJobForm: { background: 'white', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  input: { padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #eee', fontSize: '14px', outline: 'none' },
  saveBtn: { padding: '12px', borderRadius: '12px', background: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '15px' },
};

export default AdminPage;