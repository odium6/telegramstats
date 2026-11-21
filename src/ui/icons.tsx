// Простые линейные иконки (24×24, stroke = currentColor).
const I = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const Icon = {
  overview: (p: { size?: number }) => <I {...p} d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />,
  time: (p: { size?: number }) => <I {...p} d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  dialog: (p: { size?: number }) => <I {...p} d="M7 9h10M7 13h6M5 19l-1 3 4-2h10a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v10a3 3 0 0 0 2 3z" />,
  text: (p: { size?: number }) => <I {...p} d="M4 6V4h16v2M9 20h6M12 4v16" />,
  media: (p: { size?: number }) => <I {...p} d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5h.01" />,
  messages: (p: { size?: number }) => <I {...p} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  accuracy: (p: { size?: number }) => <I {...p} d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6zM9 12l2 2 4-4" />,
  upload: (p: { size?: number }) => <I {...p} d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  folder: (p: { size?: number }) => <I {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: (p: { size?: number }) => <I {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />,
  download: (p: { size?: number }) => <I {...p} d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  settings: (p: { size?: number }) => <I {...p} d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" />,
  moon: (p: { size?: number }) => <I {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: (p: { size?: number }) => <I {...p} d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  close: (p: { size?: number }) => <I {...p} d="M6 6l12 12M18 6 6 18" />,
  left: (p: { size?: number }) => <I {...p} d="M15 18l-6-6 6-6" />,
  right: (p: { size?: number }) => <I {...p} d="M9 18l6-6-6-6" />,
  lock: (p: { size?: number }) => <I {...p} d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />,
  image: (p: { size?: number }) => <I {...p} d="M4 5h16v14H4zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 15l-5-5L5 19" />,
  table: (p: { size?: number }) => <I {...p} d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14" />,
  info: (p: { size?: number }) => <I {...p} d="M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  play: (p: { size?: number }) => <I {...p} d="M7 4v16l13-8z" />,
  mic: (p: { size?: number }) => <I {...p} d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />,
  phone: (p: { size?: number }) => <I {...p} d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  jump: (p: { size?: number }) => <I {...p} d="M7 17 17 7M8 7h9v9" />,
  sparkle: (p: { size?: number }) => <I {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />,
  back: (p: { size?: number }) => <I {...p} d="M19 12H5M11 6l-6 6 6 6" />,
};
