// The berry flower: the object that feeds the snake, in the place of the original's pearl. Idle it
// is a closed bud with a glowing seed. A gift makes it bloom around the giver's face, with their
// name, their daily title and "+N BERRIES", and it stays open while their berries drip out of it
// one by one; then it closes again.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { FLOWER } from './grid.ts';
import { GOLD, berryTint } from '../engine/palette.ts';
import { FONT, paintFace } from './paint.ts';
import { fanOf, game } from './state.ts';

const GREEN = berryTint(null);
const PETALS = 9;

function petal(angle: number, len: number, wide: number, shade: number): void {
  const c = ctx;
  c.save();
  c.rotate(angle);
  const g = c.createLinearGradient(0, 0, 0, -len);
  g.addColorStop(
    0,
    `rgb(${String(200 - shade)},${String(84 - shade / 2)},${String(110 - shade / 2)})`,
  );
  g.addColorStop(1, '#f6b8c4');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(wide, -len * 0.35, wide * 0.8, -len * 0.95, 0, -len);
  c.bezierCurveTo(-wide * 0.8, -len * 0.95, -wide, -len * 0.35, 0, 0);
  c.fill();
  c.strokeStyle = 'rgba(255,235,240,0.35)';
  c.lineWidth = 1.5;
  c.stroke();
  c.restore();
}

function leaf(angle: number, len: number): void {
  const c = ctx;
  c.save();
  c.rotate(angle);
  c.fillStyle = '#4f7a4a';
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.3, 0, 0);
  c.fill();
  c.restore();
}

const easeOutBack = (u: number): number => {
  const x = Math.min(1, Math.max(0, u)) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};
const easeInOut = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

export function paintFlower(t: number): void {
  const c = ctx,
    pour = game.pour,
    shut = easeInOut(game.closeT / 0.7);
  // Each petal opens a beat after the previous one, with a soft spring; all close together.
  const openness = (i: number): number =>
    pour ? easeOutBack((game.pourT - i * 0.035) / 0.6) * (1 - shut) : 0;
  const open = openness(PETALS / 2),
    squeeze = 1 + 0.07 * Math.exp(-game.dripT * 14) * open,
    sway = 0.035 * Math.sin(t * 1.3);
  c.save();
  c.translate(FLOWER.x, FLOWER.y);
  c.rotate(sway);
  c.scale(squeeze, squeeze);
  // Glow behind, stronger while it pours.
  const halo = c.createRadialGradient(0, 0, 10, 0, 0, 160);
  halo.addColorStop(0, `rgba(246,184,196,${String(0.16 + 0.32 * open)})`);
  halo.addColorStop(1, 'rgba(246,184,196,0)');
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, 160, 0, Math.PI * 2);
  c.fill();
  leaf(0.35 + 0.05 * Math.sin(t * 1.7), 110);
  leaf(Math.PI - 0.35 - 0.05 * Math.sin(t * 1.7 + 1), 110);
  // Petals: bunched upward as a bud, fanned all around when open, each breathing on its own.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < PETALS; i++) {
      const o = openness(i),
        k = i - (PETALS - 1) / 2,
        closedA = k * 0.15,
        openA = (i / PETALS) * Math.PI * 2 + (pass ? Math.PI / PETALS : 0),
        flutter = 0.03 * Math.sin(t * 2.4 + i * 0.9);
      const a = closedA + (openA - closedA) * o + flutter,
        len = (58 + 44 * o) * (1 + 0.025 * Math.sin(t * 2 + i)) * (pass ? 0.78 : 1),
        wide = 24 + 14 * o;
      petal(a, len, wide, pass ? 0 : 40);
    }
  c.restore();
  if (pour && open > 0.05) {
    const pop = easeOutBack(game.pourT / 0.45);
    c.save();
    c.globalAlpha = Math.min(1, open * 1.4);
    paintFace(fanOf(pour.nickname) ?? pour, FLOWER.x, FLOWER.y, 50 * pop * squeeze, GOLD);
    // Left: who. Right: how much. They slide out from behind the flower.
    const slide = 40 * (1 - Math.min(1, open));
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    c.fillStyle = '#fff';
    c.font = `900 32px ${FONT}`;
    c.lineWidth = 7;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,20,15,0.8)';
    const name = pour.nickname.length > 14 ? pour.nickname.slice(0, 13) + '…' : pour.nickname,
      lx = FLOWER.x - 118 + slide,
      rx = FLOWER.x + 118 - slide;
    c.strokeText(name, lx, FLOWER.y - 14);
    c.fillText(name, lx, FLOWER.y - 14);
    if (pour.title) {
      c.font = `800 17px ${FONT}`;
      const w = c.measureText(pour.title).width + 26;
      c.fillStyle = 'rgba(12,20,15,0.85)';
      c.beginPath();
      c.roundRect(lx - w, FLOWER.y + 8, w, 30, 15);
      c.fill();
      c.fillStyle = GOLD;
      c.fillText(pour.title, lx - 13, FLOWER.y + 24);
    }
    c.textAlign = 'left';
    c.font = `900 50px ${FONT}`;
    c.strokeText(`+${String(pour.total)}`, rx, FLOWER.y - 12);
    c.fillStyle = GREEN;
    c.fillText(`+${String(pour.total)}`, rx, FLOWER.y - 12);
    c.font = `800 18px ${FONT}`;
    const unit = tr(pour.total > 1 ? 'feed.berries' : 'feed.berry');
    c.beginPath();
    c.roundRect(rx, FLOWER.y + 18, c.measureText(unit).width + 24, 28, 14);
    c.fillStyle = 'rgba(12,20,15,0.85)';
    c.fill();
    c.fillStyle = GREEN;
    c.fillText(unit, rx + 12, FLOWER.y + 33);
    c.restore();
  } else {
    // The seed waiting in the bud.
    c.save();
    c.fillStyle = GREEN;
    c.shadowColor = 'rgba(155,226,138,0.9)';
    c.shadowBlur = 18;
    c.beginPath();
    c.arc(FLOWER.x, FLOWER.y - 20, 11 + 2 * Math.sin(t * 3), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
