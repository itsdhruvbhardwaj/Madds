import { useEffect, useState, type CSSProperties } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { StyleImage } from './components';
import type { Style } from './types';

export function BeforeAfterComparison({ style }: { style: Style }) {
  const [position, setPosition] = useState(50);
  const [automatic, setAutomatic] = useState(true);
  useEffect(() => {
    if (!automatic) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let started = performance.now();
    const tick = (now: number) => {
      // Accelerate through the middle and ease into the handle's travel limits.
      setPosition(50 + 50 * Math.sin((now - started) * Math.PI / 3000));
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      if (!motion.matches) { started = performance.now(); frame = requestAnimationFrame(tick); }
    };
    update(); motion.addEventListener('change', update);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', update); };
  }, [automatic]);
  return <div className="before-after" style={{ '--split': `calc(24px + (100% - 48px) * ${position / 100})` } as CSSProperties}>
    <StyleImage src={style.exampleAfterUrl || style.thumbnail} alt={`${style.name}, after`} large priority />
    <div className="before-layer"><StyleImage src={style.exampleBeforeUrl || style.thumbnail} alt="Before transformation" large priority /></div>
    <span className="compare-label before">Before</span><span className="compare-label after">After</span>
    <div className="compare-line" />
    <span className="compare-handle" aria-hidden="true"><MoveHorizontal size={21} strokeWidth={2} /></span>
    <input aria-label="Before and after comparison" type="range" min="0" max="100" step="any" value={position}
      onPointerDown={() => setAutomatic(false)} onKeyDown={() => setAutomatic(false)}
      onChange={event => { setAutomatic(false); setPosition(Number(event.target.value)); }} />
  </div>;
}
