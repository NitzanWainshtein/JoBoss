import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import ICON_SIZES from '../iconSizes';

function Navbar({ isAdmin = false }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const itemRefs  = useRef([]);
  const navRef    = useRef(null);
  const [bubble, setBubble] = useState({ left: 0, width: 0 });
  const [ready,  setReady]  = useState(false);

  const navItems = [
    { path: '/swipe',        icon: '/icons/jobs_icon.png',       label: 'משרות'  },
    { path: '/applications', icon: '/icons/applies_icon.png',    label: 'הגשות'  },
    { path: '/profile',      icon: '/icons/profile_icon.png',    label: 'פרופיל' },
    ...(isAdmin ? [{ path: '/admin', icon: '/icons/admin_edit_icon.png', label: 'Admin' }] : []),
  ];

  const activeIndex = navItems.findIndex(item => location.pathname === item.path);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || activeIndex < 0) return;

    const navW    = nav.getBoundingClientRect().width;
    const padding = 4;
    const n       = navItems.length;
    const itemW   = (navW - padding * 2) / n;
    const bubbleW = itemW - 4;
    const bubbleLeft = padding + activeIndex * itemW + 2;

    setBubble({ left: bubbleLeft, width: bubbleW });
    setReady(true);
  }, [activeIndex, navItems.length]);

  return (
    <>
      <div style={styles.header}>
        <img
          src={isAdmin ? '/icons/admin_logo.png' : '/app_logo.png'}
          alt="joBoss"
          style={styles.logo}
        />
      </div>

      <nav ref={navRef} style={styles.navbar}>
        {ready && activeIndex >= 0 && (
          <div style={{
            ...styles.bubble,
            left:  bubble.left,
            width: bubble.width,
          }} />
        )}

        {navItems.map((item, i) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              ref={el => (itemRefs.current[i] = el)}
              onClick={() => navigate(item.path)}
              style={{
                ...styles.navBtn,
                color:     active ? '#6C4FD4' : 'rgba(90,80,120,0.55)',
                fontWeight: active ? 700 : 500,
                transform:  active ? 'translateY(-1px)' : 'none',
              }}
            >
              <img
                src={item.icon}
                alt={item.label}
                style={{
                  ...styles.iconImg,
                  filter: active
                    ? 'none'
                    : 'grayscale(40%) opacity(0.6)',
                }}
              />
              <span style={styles.label}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

const styles = {
  header: {
    position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
    backgroundImage: 'url(/icons/swipes_icons/top_bar.png)',
    backgroundSize: 'cover', backgroundPosition: 'center bottom',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100,
  },
  logo: {
    height: '44px', objectFit: 'contain',
    filter: 'drop-shadow(0 1px 3px rgba(255,255,255,0.4))',
  },
  navbar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px',
    background: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(18px)',
    borderTop: '1px solid rgba(130,90,255,0.12)',
    boxShadow: '0 -6px 24px rgba(110,80,220,0.09)',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    zIndex: 100, direction: 'ltr', boxSizing: 'border-box',
    padding: '0 4px', overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    top: '7px',
    height: '56px',
    borderRadius: '999px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(232,222,255,0.82))',
    border: '1px solid rgba(132,92,255,0.22)',
    boxShadow: '0 8px 24px rgba(126,87,255,0.16), inset 0 1px 0 rgba(255,255,255,0.85)',
    backdropFilter: 'blur(18px)',
    pointerEvents: 'none',
    zIndex: 0,
    transition: 'left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)',
  },
  navBtn: {
    position: 'relative', zIndex: 1,
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '3px', background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '8px 0',
    transition: 'color 0.25s ease, transform 0.25s ease',
  },
  iconImg: {
    width:  `${ICON_SIZES.navbar}px`,
    height: `${ICON_SIZES.navbar}px`,
    objectFit: 'contain',
    transition: 'filter 0.25s ease',
  },
  label: { fontSize: '10px' },
};

export default Navbar;
