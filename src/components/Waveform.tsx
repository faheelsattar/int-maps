import { useEffect, useRef } from 'react';

/** Live frequency bars driven by the narrator's AnalyserNode. */
export function Waveform({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    const BARS = 38;
    let raf = 0;
    let t = 0;
    // Bar colours follow the theme's accent.
    let colors = ['', ''];
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors = [cs.getPropertyValue('--accent-2').trim(), cs.getPropertyValue('--accent').trim()];
    };
    readColors();
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (analyser) analyser.getByteFrequencyData(data);
      t += 0.04;
      if (Math.round(t * 25) % 30 === 0) readColors();
      const gap = 3;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const bin = Math.floor(2 + (i / BARS) ** 1.4 * 60);
        const live = analyser && active ? data[bin] / 255 : 0;
        const idle = 0.08 + 0.05 * Math.sin(t + i * 0.45);
        const v = Math.max(idle, live);
        const bh = Math.max(3, v * h);
        const grad = ctx.createLinearGradient(0, (h - bh) / 2, 0, (h + bh) / 2);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);

  return <canvas ref={ref} className="h-10 w-full" />;
}
