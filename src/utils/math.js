// src/utils/math.js

export const lerp = (start, end, factor) => {
  return start + (end - start) * factor;
};

// A highly stable orthogonal path router
export const getOrthogonalPoints = (start, end, nodes = []) => {
  const margin = 25;

  const getDir = (edge) => {
    if (edge === 'left') return { dx: -1, dy: 0 };
    if (edge === 'right') return { dx: 1, dy: 0 };
    if (edge === 'top') return { dx: 0, dy: -1 };
    if (edge === 'bottom') return { dx: 0, dy: 1 };
    return { dx: 0, dy: 0 };
  };

  const dS = getDir(start.edge);
  const dE = getDir(end.edge);

  const p1 = { x: start.x + dS.dx * margin, y: start.y + dS.dy * margin };
  const p2 = { x: end.x + dE.dx * margin, y: end.y + dE.dy * margin };

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  const pathH = [start, p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2, end];
  const pathV = [start, p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2, end];

  const simplify = (pts) => {
    const res = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = res[res.length - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      if ((Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1) ||
        (Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1)) {
        continue;
      }
      res.push(curr);
    }
    res.push(pts[pts.length - 1]);
    return res;
  };

  const sPathH = simplify(pathH);
  const sPathV = simplify(pathV);

  if (!nodes.length) return sPathH;

  const intersects = (A, B, node) => {
    const pad = 15;
    const minX = Math.min(A.x, B.x) - pad, maxX = Math.max(A.x, B.x) + pad;
    const minY = Math.min(A.y, B.y) - pad, maxY = Math.max(A.y, B.y) + pad;
    return !(maxX < node.x || minX > node.x + node.w || maxY < node.y || minY > node.y + node.h);
  };

  const hitsNode = (path) => {
    for (let i = 1; i < path.length - 2; i++) {
      for (let n of nodes) {
        if (n.isDeleting) continue;
        if (intersects(path[i], path[i + 1], n)) return true;
      }
    }
    return false;
  };

  const hitH = hitsNode(sPathH);
  const hitV = hitsNode(sPathV);

  if (!hitH) return sPathH;
  if (!hitV) return sPathV;

  return Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y) ? sPathH : sPathV;
};

export const getCurvedPathFromPoints = (pts, cornerRadius = 16) => {
  // FIX: Properly format straight lines (2 points) into drawing commands
  if (pts.length <= 2) {
    if (pts.length === 0) return [];
    if (pts.length === 1) return [{ type: 'move', x: pts[0].x, y: pts[0].y }];
    return [
      { type: 'move', x: pts[0].x, y: pts[0].y },
      { type: 'line', x: pts[1].x, y: pts[1].y }
    ];
  }

  const commands = [];
  commands.push({ type: 'move', x: pts[0].x, y: pts[0].y });

  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];

    if (i < pts.length - 2) {
      const after = pts[i + 2];
      const segLen1 = Math.hypot(next.x - curr.x, next.y - curr.y);
      const segLen2 = Math.hypot(after.x - next.x, after.y - next.y);
      const r = Math.min(cornerRadius, segLen1 / 2, segLen2 / 2);

      if (r > 1) {
        const dx1 = next.x - curr.x;
        const dy1 = next.y - curr.y;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const dx2 = after.x - next.x;
        const dy2 = after.y - next.y;
        const len2 = Math.hypot(dx2, dy2) || 1;

        const beforeCorner = { x: next.x - (dx1 / len1) * r, y: next.y - (dy1 / len1) * r };
        const afterCorner = { x: next.x + (dx2 / len2) * r, y: next.y + (dy2 / len2) * r };

        commands.push({ type: 'line', x: beforeCorner.x, y: beforeCorner.y });
        commands.push({ type: 'quadratic', cpx: next.x, cpy: next.y, x: afterCorner.x, y: afterCorner.y });
      } else {
        commands.push({ type: 'line', x: next.x, y: next.y });
      }
    } else {
      commands.push({ type: 'line', x: next.x, y: next.y });
    }
  }

  return commands;
};

// NEW: Flattens SVG-like commands into a dense array of coordinates for physical warping
export const flattenCurvedPath = (commands, step = 5) => {
  const pts = [];
  let curX = 0, curY = 0;

  for (const cmd of commands) {
    if (cmd.type === 'move') {
      curX = cmd.x; curY = cmd.y;
      pts.push({ x: curX, y: curY });
    } else if (cmd.type === 'line') {
      const dist = Math.hypot(cmd.x - curX, cmd.y - curY);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= steps; i++) {
        pts.push({ x: curX + (cmd.x - curX) * (i / steps), y: curY + (cmd.y - curY) * (i / steps) });
      }
      curX = cmd.x; curY = cmd.y;
    } else if (cmd.type === 'quadratic') {
      const dist = Math.hypot(cmd.x - curX, cmd.y - curY);
      const steps = Math.max(1, Math.ceil(dist / (step * 0.8))); // Slightly denser on curves
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const nx = (1 - t) * (1 - t) * curX + 2 * (1 - t) * t * cmd.cpx + t * t * cmd.x;
        const ny = (1 - t) * (1 - t) * curY + 2 * (1 - t) * t * cmd.cpy + t * t * cmd.y;
        pts.push({ x: nx, y: ny });
      }
      curX = cmd.x; curY = cmd.y;
    }
  }
  return pts;
};

export const getLineIntersection = (p0, p1, p2, p3) => {
  const s1_x = p1.x - p0.x, s1_y = p1.y - p0.y;
  const s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
  const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
  const t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return { x: p0.x + (t * s1_x), y: p0.y + (t * s1_y) };
  }
  return null;
};

export const getRectIntersection = (node, targetPt) => {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = targetPt.x - cx;
  const dy = targetPt.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy, edge: 'center' };

  const hw = node.w / 2;
  const hh = node.h / 2;
  const tan_theta = Math.abs(dy / dx);
  const tan_alpha = hh / hw;

  let ix, iy, edge;
  if (tan_theta <= tan_alpha) {
    ix = cx + (dx > 0 ? hw : -hw);
    iy = cy + (dy / Math.abs(dx)) * hw;
    edge = dx > 0 ? 'right' : 'left';
  } else {
    ix = cx + (dx / Math.abs(dy)) * hh;
    iy = cy + (dy > 0 ? hh : -hh);
    edge = dy > 0 ? 'bottom' : 'top';
  }

  const grid = 20;
  if (edge === 'left' || edge === 'right') {
    iy = Math.round(iy / grid) * grid;
    iy = Math.max(node.y + 10, Math.min(node.y + node.h - 10, iy));
  } else {
    ix = Math.round(ix / grid) * grid;
    ix = Math.max(node.x + 10, Math.min(node.x + node.w - 10, ix));
  }

  return { x: ix, y: iy, edge };
};