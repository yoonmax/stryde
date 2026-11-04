/**
 * Crosshair. "Auto" uses difference blending against the frame beneath it, which gives a crisp dark mark
 * on bright concrete and a light one on dark graphite without sampling the frame.
 */
const COLORS = { white: '#ffffff', dark: '#0a1a2c', signal: '#5fd6f0' };

export function Crosshair({ gameplay }) {
  const { crosshairStyle: style, crosshairColor: colorName, crosshairSize: size } = gameplay;
  const auto = colorName === 'auto';
  const color = auto ? '#ffffff' : COLORS[colorName] ?? '#ffffff';
  const len = 5 * size, thick = Math.max(1.5, 1.5 * size), gap = style === 'gap' ? 3 * size : 0;
  const box = (x, y, w, h, key) => <i key={key} style={{ left: x, top: y, width: w, height: h }} />;
  let parts;
  if (style === 'dot') {
    const d = 3 * size;
    parts = <i style={{ left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: '50%' }} />;
  } else if (style === 'circle') {
    const d = 12 * size;
    parts = (
      <>
        <i style={{ left: -d / 2, top: -d / 2, width: d, height: d, borderRadius: '50%', background: 'transparent', border: `${thick * 0.8}px solid ${color}` }} />
        <i style={{ left: -thick / 2, top: -thick / 2, width: thick, height: thick }} />
      </>
    );
  } else {
    const offset = -thick / 2;
    parts = [
      box(-len - gap, offset, len, thick, 'l'), box(gap, offset, len, thick, 'r'),
      box(offset, -len - gap, thick, len, 't'), box(offset, gap, thick, len, 'b'),
    ];
    if (!gap) parts.push(box(offset, offset, thick, thick, 'c'));
  }
  return <div className="crosshair" data-color={auto ? 'auto' : 'fixed'} style={{ '--xc': color }}>{parts}</div>;
}
