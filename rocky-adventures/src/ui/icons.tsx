// Iconos vectoriales originales de la interfaz.
export const BoneIcon = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3b0" /><stop offset="1" stopColor="#f2a900" /></linearGradient></defs>
    <g transform="rotate(-30 32 32)" stroke="#8a5300" strokeWidth="3" fill="url(#bg)">
      <path d="M14 26a7 7 0 1 1 6-9h24a7 7 0 1 1 6 9 7 7 0 1 1-6 9H20a7 7 0 1 1-6-9z" />
    </g>
  </svg>
)

export const CookieIcon = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="25" fill="#d08f4f" stroke="#7a4417" strokeWidth="3" />
    <g fill="#7a4417">
      <ellipse cx="32" cy="38" rx="8" ry="6.5" />
      <circle cx="22" cy="28" r="3.6" /><circle cx="28" cy="22" r="3.6" /><circle cx="36" cy="22" r="3.6" /><circle cx="42" cy="28" r="3.6" />
    </g>
  </svg>
)

export const ShellIcon = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <path d="M32 54 L10 30 A24 24 0 0 1 54 30 Z" fill="#ffc8d2" stroke="#b5546a" strokeWidth="3" />
    {[18, 25, 32, 39, 46].map((x) => <path key={x} d={`M32 52 L${x} 14`} stroke="#d7798c" strokeWidth="2" />)}
  </svg>
)

export const HeartIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64">
    <path d="M32 56 C10 40 4 28 10 18 c6-10 18-9 22 1 c4-10 16-11 22-1 c6 10 0 22-22 38z" fill="#ff5a6a" stroke="#8a1424" strokeWidth="3" />
    <ellipse cx="22" cy="22" rx="5" ry="3" fill="#fff" opacity=".6" />
  </svg>
)

export const PawIcon = ({ color = '#ffcb3d' }: { color?: string }) => (
  <svg viewBox="0 0 64 64">
    <g fill={color}>
      <ellipse cx="32" cy="42" rx="13" ry="11" />
      <ellipse cx="15" cy="27" rx="6" ry="7.5" /><ellipse cx="26" cy="17" rx="6" ry="7.5" /><ellipse cx="38" cy="17" rx="6" ry="7.5" /><ellipse cx="49" cy="27" rx="6" ry="7.5" />
    </g>
  </svg>
)
