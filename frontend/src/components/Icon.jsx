// Mock-only icon set: plain stroke glyphs drawn for this concept, so the UI no
// longer depends on emoji (which render differently on every OS).
const P = {
  jobs: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 12.5h18" /></>,
  applications: <><path d="M21 3 10.5 13.5" /><path d="M21 3l-6.5 18-4-7.5L3 9.500z" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.500s6.8 1.9 8 5.5" /></>,
  admin: <><path d="M12 3l7.5 3v5.500c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.500V6z" /><path d="M9 12l2.2 2.200L15.2 10" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.500a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.500L14 2.500h-4l-.4 2.500A7.6 7.6 0 0 0 7 6.500l-2.4-1-2 3.5 2 1.500a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.500l.4 2.500h4l.4-2.500a7.6 7.6 0 0 0 2.6-1.500l2.4 1 2-3.500z" /></>,
  crown: <><path d="M3.5 8l4 4L12 5l4.5 7 4-4-1.5 10.500h-14z" /></>,
  edit: <><path d="M4 20h4L19.5 8.500a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 7.500l3 3" /></>,
  camera: <><path d="M4 8h3l1.5-2.500h7L17 8h3a1 1 0 0 1 1 1v9.500a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M16 7l3 3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z" /></>,
  logout: <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  heart: <path d="M12 20.500s-7.5-4.6-9-9.700C2 7.3 4.3 4.5 7.4 4.500c1.9 0 3.5 1 4.6 2.6 1.1-1.6 2.7-2.6 4.6-2.6 3.1 0 5.4 2.8 4.4 6.3-1.5 5.1-9 9.7-9 9.700z" />,
  undo: <><path d="M8 5L4 9l4 4" /><path d="M4 9h9.500a5.5 5.5 0 0 1 0 11H8" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.500v.1" /></>,
  refresh: <><path d="M20 12a8 8 0 0 1-14.3 4.9" /><path d="M4 12a8 8 0 0 1 14.3-4.9" /><path d="M18.5 3v4.500H14" /><path d="M5.5 21v-4.500H10" /></>,
  star: <path d="M12 3.500l2.6 5.3 5.9.9-4.3 4.1 1 5.800L12 16.900l-5.2 2.7 1-5.800L3.5 9.700l5.9-.9z" />,
  pin: <><path d="M12 21s7-6.2 7-11.500A7 7 0 0 0 5 9.500C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  chevron: <path d="M9 5l7 7-7 7" />,
  bolt: <path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.500V8a4 4 0 0 1 8 0v2.5" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5h6V7H9z" /><path d="M8.5 13.5l2.2 2.2 4.8-4.7" /></>,
  graduation: <><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" /><path d="M6.5 11.8V16c1.6 1.6 3.4 2.3 5.5 2.3s3.9-.7 5.5-2.3v-4.2" /><path d="M21.5 9.5V15" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6" /><path d="M8.2 13.2l7.6 3.6" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  arrowUp: <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  chart: <><path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-7" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  check: <path d="M4.5 12.500l5 5 10-11" />,
  a11y: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.500c4.5 1.3 9.5 1.3 14 0" /><path d="M12 9.500v5" /><path d="M8.5 21l3.5-6.5 3.5 6.5" /></>,
  doc: <><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>,
  sparkle: <path d="M12 3c.6 4.8 2.7 7.4 9 9-6.3 1.6-8.4 4.2-9 9-.6-4.8-2.7-7.4-9-9 6.3-1.6 8.4-4.2 9-9z" />,
  screens: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>,
};

export default function Icon({ name, size = 22, color = 'currentColor', fill = 'none', strokeWidth = 2, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {P[name] || null}
    </svg>
  );
}
