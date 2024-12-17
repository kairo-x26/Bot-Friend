import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

export type IconName =
  | 'send'
  | 'stop'
  | 'chat'
  | 'play'
  | 'sliders'
  | 'user'
  | 'more'
  | 'flag'
  | 'trash'
  | 'back'
  | 'check'
  | 'close'
  | 'plus'
  | 'retry'
  | 'sparkle'
  | 'lock'
  | 'mic'
  | 'search'
  | 'heart'
  | 'brain'
  | 'download'
  | 'bell';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Hand-drawn-ish rounded line icons, 24px grid. Decorative: wrap in a labelled control. */
export function Icon({ name, size = 24, color, strokeWidth = 2 }: IconProps) {
  const t = useTheme();
  const c = color ?? t.colors.text;
  const common = { stroke: c, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'send' && <Path {...common} d="M5 12h12M12 6l6 6-6 6" />}
      {name === 'stop' && <Rect x="7" y="7" width="10" height="10" rx="2.5" fill={c} />}
      {name === 'chat' && <Path {...common} d="M5 17.5V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8v5.4a2.8 2.8 0 0 1-2.8 2.8H9l-4 3.5Z" />}
      {name === 'play' && (
        <>
          <Rect {...common} x="3.5" y="7" width="17" height="10.5" rx="5.25" />
          <Path {...common} d="M8 10.5v3.5M6.25 12.25h3.5" />
          <Circle cx="15.5" cy="11" r="1.1" fill={c} />
          <Circle cx="17.5" cy="13.4" r="1.1" fill={c} />
        </>
      )}
      {name === 'sliders' && <Path {...common} d="M5 7h9M18 7h1M5 17h3M12 17h7M16 5v4M10 15v4" />}
      {name === 'user' && (
        <>
          <Circle {...common} cx="12" cy="8.5" r="3.5" />
          <Path {...common} d="M5.5 19c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
        </>
      )}
      {name === 'more' && (
        <>
          <Circle cx="6" cy="12" r="1.6" fill={c} />
          <Circle cx="12" cy="12" r="1.6" fill={c} />
          <Circle cx="18" cy="12" r="1.6" fill={c} />
        </>
      )}
      {name === 'flag' && <Path {...common} d="M6 20V5m0 0c4-2 8 2 12 0v8c-4 2-8-2-12 0" />}
      {name === 'trash' && <Path {...common} d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10.5 11v5M13.5 11v5" />}
      {name === 'back' && <Path {...common} d="M15 5.5 8.5 12l6.5 6.5" />}
      {name === 'check' && <Path {...common} d="m5.5 12.5 4 4 9-9" />}
      {name === 'close' && <Path {...common} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
      {name === 'plus' && <Path {...common} d="M12 5.5v13M5.5 12h13" />}
      {name === 'retry' && <Path {...common} d="M18.5 9A7 7 0 1 0 19 13.5M18.5 4.5V9H14" />}
      {name === 'sparkle' && <Path {...common} d="M12 4c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6ZM18.5 15.5c.3 1.5.9 2.1 2.5 2.5-1.6.4-2.2 1-2.5 2.5-.3-1.5-.9-2.1-2.5-2.5 1.6-.4 2.2-1 2.5-2.5Z" />}
      {name === 'lock' && (
        <>
          <Rect {...common} x="5.5" y="10.5" width="13" height="9" rx="2.5" />
          <Path {...common} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </>
      )}
      {name === 'mic' && <Path {...common} d="M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 18v2.5" />}
      {name === 'search' && (
        <>
          <Circle {...common} cx="11" cy="11" r="6" />
          <Path {...common} d="m15.5 15.5 4 4" />
        </>
      )}
      {name === 'heart' && <Path {...common} d="M12 19s-7-4.4-7-9.5A3.9 3.9 0 0 1 12 7.2a3.9 3.9 0 0 1 7 2.3C19 14.6 12 19 12 19Z" />}
      {name === 'brain' && <Path {...common} d="M9.5 5.5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5 3 3 0 0 0 4 4.5V5.5Zm5 0a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5 3 3 0 0 1-4 4.5V5.5Z" />}
      {name === 'download' && <Path {...common} d="M12 4.5v10m0 0-4-4m4 4 4-4M5.5 19h13" />}
      {name === 'bell' && <Path {...common} d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20a2 2 0 0 0 4 0" />}
    </Svg>
  );
}
