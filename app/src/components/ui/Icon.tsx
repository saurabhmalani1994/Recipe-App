/**
 * The app's inline SVG icon set (S22a: "proper icons, not emoji"). 24x24 grid, 1.75 stroke,
 * round caps, drawn with `currentColor` so an icon takes the colour of its text.
 */
const PATHS = {
  home: (
    <>
      <path d="M3.5 10.5 12 3.8l8.5 6.7" />
      <path d="M5.5 9v10.2a.8.8 0 0 0 .8.8H10v-5.5h4V20h3.7a.8.8 0 0 0 .8-.8V9" />
    </>
  ),
  cook: (
    <>
      <path d="M3 11.5h15v2.8a5.2 5.2 0 0 1-5.2 5.2H8.2A5.2 5.2 0 0 1 3 14.3z" />
      <path d="M18 12.5h3" />
      <path d="M7.5 8.2c0-1.2 1.2-1.2 1.2-2.4S7.5 4.6 7.5 3.4" />
      <path d="M12 8.2c0-1.2 1.2-1.2 1.2-2.4S12 4.6 12 3.4" />
    </>
  ),
  plan: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
    </>
  ),
  list: (
    <>
      <path d="M4 7.5h2.2l1.6 9.3a1.6 1.6 0 0 0 1.6 1.3h7.4a1.6 1.6 0 0 0 1.6-1.2L20 10H7" />
      <circle cx="9.5" cy="20.6" r=".6" />
      <circle cx="17" cy="20.6" r=".6" />
      <path d="M10.5 13.5l1.7 1.7 3.3-3.4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5c-1.8-1.4-4.4-2-8-2v13.8c3.6 0 6.2.6 8 2 1.8-1.4 4.4-2 8-2V4.5c-3.6 0-6.2.6-8 2z" />
      <path d="M12 6.5v13.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4z" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  chevronDown: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  chevronRight: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  star: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13.5 15-14-.4 9.8-6 15-14 15" />
      <path d="M5 19l7-7" />
    </>
  ),
  pot: (
    <>
      <path d="M4 10h16v5.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      <path d="M2.5 10h19M9 6.5h6M12 6.5V10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" />
    </>
  ),
  whisk: (
    <>
      <path d="M13.5 10.5 21 3" />
      <path d="M13.8 10.2c1.8 2.9 1.3 6.5-1.2 9-2.4 2.3-5.5 2.7-6.8 1.4S5 16.6 7.4 14.2c2.4-2.5 6-3 8.9-1.2" />
      <path d="M9.2 17.5l3.2-3.2" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="8.8" cy="8.8" r=".9" />
      <circle cx="15.2" cy="8.8" r=".9" />
      <circle cx="12" cy="12" r=".9" />
      <circle cx="8.8" cy="15.2" r=".9" />
      <circle cx="15.2" cy="15.2" r=".9" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8.5h14l-3.5-3.5" />
      <path d="M20 15.5H6l3.5 3.5" />
    </>
  ),
  basket: (
    <>
      <path d="M3.5 10h17l-1.6 8.3a2 2 0 0 1-2 1.7H7.1a2 2 0 0 1-2-1.7z" />
      <path d="M8 10l3-6M16 10l-3-6M9 14v2.5M12 14v2.5M15 14v2.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  calendarPlus: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" />
    </>
  ),
  // S22b
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M6.5 6.5l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3l.9-12.2" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="18" cy="12" r="1.1" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.6v6.8l5.4-3.4z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 7.5l3 3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c.4-3 2.6-5 5.5-5s5.1 2 5.5 5" />
      <path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.8c1.7.7 2.8 2.4 3 4.7" />
    </>
  ),
  flame: (
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.2 3.6-7.8.4 1.6 1.2 2.6 2.3 3.1C11.7 7 12.9 4.5 15 3c-.3 2.8 3.5 5.6 3.5 11.2 0 4-2.6 6.8-6.5 6.8z" />
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  cart: (
    <>
      <path d="M3.5 4.5h2.2l2 11a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.4-1.1L20.5 8H6.4" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  /** Fill the shape (a pressed star, the active nav icon) instead of stroking it. */
  filled?: boolean
  className?: string
}

export function Icon({ name, size = 24, filled = false, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
