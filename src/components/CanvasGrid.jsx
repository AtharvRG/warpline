// src/components/CanvasGrid.jsx
import React, { useEffect, useRef } from 'react';
import { getRectIntersection, getOrthogonalPoints, getCurvedPathFromPoints, flattenCurvedPath } from '../utils/math';

export default function CanvasGrid({ nodes, connections, draftConnection, slicePath, panRef, zoomRef }) {
  const canvasRef = useRef(null);
  const smoothedNodes = useRef({});
  const ghostEnd = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    const render = (time) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentPan = panRef.current || { x: 0, y: 0 };
      const currentZoom = zoomRef.current || 1;

      const ANIMATION_CONTROLS = {
        color: '0, 229, 255',
        lineWidth: 3.5,
        baseOpacity: 0.15,
        dashOpacity: 0.95,
        dashSpeed: 0.004,
        dashLength: 10,
        dashGap: 16,
        glowBlur: 14,
        glowOpacityMult: 0.8,
        springLag: 0.45,
        warpRadius: 140,
        warpForce: 16,
        cornerRadius: 20
      };

      // 1. Smooth node positions
      const activeNodes = nodes.map(n => {
        if (!smoothedNodes.current[n.id]) smoothedNodes.current[n.id] = { ...n };
        const sn = smoothedNodes.current[n.id];
        sn.x += (n.x - sn.x) * ANIMATION_CONTROLS.springLag;
        sn.y += (n.y - sn.y) * ANIMATION_CONTROLS.springLag;
        sn.w += (n.w - sn.w) * ANIMATION_CONTROLS.springLag;
        sn.h += (n.h - sn.h) * ANIMATION_CONTROLS.springLag;
        
        return {
          id: n.id,
          cx: sn.x + sn.w / 2,
          cy: sn.y + sn.h / 2,
          w: sn.w,
          h: sn.h,
          warpScale: n.warpScale !== undefined ? n.warpScale : 1,
          glowRad: n.glowRadius || 0.1
        };
      });

      const drawPolyline = (context, pts) => {
        if (!pts || pts.length === 0) return;
        context.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) context.lineTo(pts[i].x, pts[i].y);
      };

      const drawCustomFlowLine = (pts, isDraft = false) => {
        if (!pts || pts.length < 2) return;
        const LINE_WIDTH = 3.0;
        const SPEED = 0.1; 
        const PULSE_LENGTH = 125; 
        const PULSE_GAP = -50; 
        const PERIOD = PULSE_LENGTH + PULSE_GAP;
        const currentTime = typeof time !== 'undefined' ? time : performance.now() / 1000;

        ctx.save();
        ctx.beginPath();
        drawPolyline(ctx, pts);
        ctx.strokeStyle = isDraft ? 'rgba(40, 60, 90, 0.2)' : 'rgba(40, 60, 90, 0.4)';
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        const LAYERS = 15; 
        ctx.globalCompositeOperation = 'lighter'; 
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const centerPos = (((currentTime * SPEED) % PERIOD) + PERIOD) % PERIOD;

        for (let i = 0; i < LAYERS; i++) {
          const t = i / (LAYERS - 1);
          const dashLen = PULSE_LENGTH * Math.pow(1 - t, 1.2);
          const gapLen = PERIOD - dashLen;
          const offset = (dashLen / 2) - centerPos;

          ctx.beginPath();
          drawPolyline(ctx, pts);
          ctx.setLineDash([dashLen, gapLen]);
          ctx.lineDashOffset = offset;

          if (i === Math.floor(LAYERS / 2)) {
            ctx.shadowColor = 'rgba(0, 210, 255, 0.8)';
            ctx.shadowBlur = 8;
          } else { ctx.shadowBlur = 0; }

          ctx.strokeStyle = "rgba(" + Math.floor(t * 150) + ", " + (210 + Math.floor(t * 45)) + ", 255, " + (isDraft ? 0.04 : 0.08) + ")";
          ctx.lineWidth = LINE_WIDTH + (t * 0.8);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      };

      ctx.save();
      ctx.translate(currentPan.x, currentPan.y);
      ctx.scale(currentZoom, currentZoom);

      const gridSpacing = 40;
      const viewLeft = -currentPan.x / currentZoom;
      const viewTop = -currentPan.y / currentZoom;
      const viewRight = (canvas.width - currentPan.x) / currentZoom;
      const viewBottom = (canvas.height - currentPan.y) / currentZoom;

      const startX = Math.floor(viewLeft / gridSpacing) * gridSpacing;
      const startY = Math.floor(viewTop / gridSpacing) * gridSpacing;

      // PERFORMANCE FIX: Batch rendering for grid dots (1 call instead of 10,000)
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      
      const highlights = [];

      for (let x = startX; x <= viewRight; x += gridSpacing) {
        for (let y = startY; y <= viewBottom; y += gridSpacing) {
          let dx = 0, dy = 0, dotLight = 0;
          
          for (let i = 0; i < activeNodes.length; i++) {
            const sn = activeNodes[i];
            const distX = Math.max(0, Math.abs(x - sn.cx) - sn.w / 2);
            const distY = Math.max(0, Math.abs(y - sn.cy) - sn.h / 2);

            // Fast rejection algorithm (skips heavy math if dot is far away)
            if (distX > ANIMATION_CONTROLS.warpRadius || distY > ANIMATION_CONTROLS.warpRadius) continue;

            const distToBox = Math.hypot(distX, distY);
            if (distToBox < ANIMATION_CONTROLS.warpRadius) {
              const force = ((ANIMATION_CONTROLS.warpRadius - distToBox) / ANIMATION_CONTROLS.warpRadius) * sn.warpScale * ANIMATION_CONTROLS.warpForce;
              const angle = Math.atan2(sn.cy - y, sn.cx - x);
              dx += Math.cos(angle) * force;
              dy += Math.sin(angle) * force;
            }

            if (distToBox < sn.glowRad) {
              const intensity = Math.pow(1 - (distToBox / sn.glowRad), 1.8) * 0.5;
              dotLight = Math.max(dotLight, intensity * (sn.glowRad / 220));
            }
          }

          if (dotLight > 0.05) {
            highlights.push({ x: x + dx, y: y + dy, light: dotLight });
          } else {
            // Using fast rects instead of slow arcs
            ctx.rect(x + dx - 1.5, y + dy - 1.5, 3, 3);
          }
        }
      }
      ctx.fill(); // Draw all basic dots instantly

      // Draw highlighted glowing dots
      for (let i = 0; i < highlights.length; i++) {
        const hl = highlights[i];
        const alpha = 0.12 + (hl.light * 0.88);
        ctx.fillStyle = "rgba(255, 255, 255, " + Math.min(1, alpha) + ")";
        const size = 3 + (hl.light * 3);
        ctx.beginPath();
        ctx.rect(hl.x - size / 2, hl.y - size / 2, size, size);
        ctx.fill();
      }

      // Render Connections
      const getDisplacement = (px, py) => {
        let dx = 0, dy = 0;
        for (let i = 0; i < activeNodes.length; i++) {
          const sn = activeNodes[i];
          const distX = Math.max(0, Math.abs(px - sn.cx) - sn.w / 2);
          const distY = Math.max(0, Math.abs(py - sn.cy) - sn.h / 2);
          if (distX > ANIMATION_CONTROLS.warpRadius || distY > ANIMATION_CONTROLS.warpRadius) continue;
          const distToBox = Math.hypot(distX, distY);
          if (distToBox < ANIMATION_CONTROLS.warpRadius) {
            const force = ((ANIMATION_CONTROLS.warpRadius - distToBox) / ANIMATION_CONTROLS.warpRadius) * sn.warpScale * ANIMATION_CONTROLS.warpForce;
            const angle = Math.atan2(sn.cy - py, sn.cx - px);
            dx += Math.cos(angle) * force;
            dy += Math.sin(angle) * force;
          }
        }
        return { dx, dy };
      };

      connections.forEach((conn) => {
        const nFrom = smoothedNodes.current[conn.from];
        const nTo = smoothedNodes.current[conn.to];
        if (nFrom && nTo) {
          const cFrom = { x: nFrom.x + nFrom.w / 2, y: nFrom.y + nFrom.h / 2 };
          const cTo = { x: nTo.x + nTo.w / 2, y: nTo.y + nTo.h / 2 };
          const start = getRectIntersection(nFrom, cTo);
          const end = getRectIntersection(nTo, cFrom);
          const rawPts = getOrthogonalPoints(start, end, Object.values(smoothedNodes.current));
          const rawCmds = getCurvedPathFromPoints(rawPts, ANIMATION_CONTROLS.cornerRadius);
          const flatPts = flattenCurvedPath(rawCmds, 5);
          
          const warpedPts = flatPts.map(pt => {
            const { dx, dy } = getDisplacement(pt.x, pt.y);
            return { x: pt.x + dx, y: pt.y + dy };
          });
          drawCustomFlowLine(warpedPts, false);
        }
      });

      if (draftConnection) {
        const nFrom = smoothedNodes.current[draftConnection.from];
        if (nFrom) {
          if (ghostEnd.current.x === 0 && ghostEnd.current.y === 0) {
            ghostEnd.current = { x: draftConnection.startX, y: draftConnection.startY };
          }
          ghostEnd.current.x += (draftConnection.endX - ghostEnd.current.x) * ANIMATION_CONTROLS.springLag;
          ghostEnd.current.y += (draftConnection.endY - ghostEnd.current.y) * ANIMATION_CONTROLS.springLag;

          const startPt = getRectIntersection(nFrom, ghostEnd.current);
          const endPt = { x: ghostEnd.current.x, y: ghostEnd.current.y, edge: 'left' };
          const rawPts = getOrthogonalPoints(startPt, endPt, Object.values(smoothedNodes.current));
          const rawCmds = getCurvedPathFromPoints(rawPts, ANIMATION_CONTROLS.cornerRadius);
          const flatPts = flattenCurvedPath(rawCmds, 5);
          
          const warpedPts = flatPts.map(pt => {
            const { dx, dy } = getDisplacement(pt.x, pt.y);
            return { x: pt.x + dx, y: pt.y + dy };
          });
          drawCustomFlowLine(warpedPts, true);

          const { dx, dy } = getDisplacement(ghostEnd.current.x, ghostEnd.current.y);
          ctx.beginPath();
          ctx.arc(ghostEnd.current.x + dx, ghostEnd.current.y + dy, 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + ANIMATION_CONTROLS.color + ", 1)";
          ctx.shadowColor = "rgba(" + ANIMATION_CONTROLS.color + ", 0.8)";
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        ghostEnd.current = { x: 0, y: 0 };
      }

      ctx.restore();

      if (slicePath && slicePath.length > 1) {
        
        ctx.beginPath();
        ctx.moveTo(slicePath[0].x, slicePath[0].y);
        for (let i = 1; i < slicePath.length; i++) ctx.lineTo(slicePath[i].x, slicePath[i].y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
  }, [nodes, connections, draftConnection, slicePath, panRef, zoomRef]);

  return <canvas ref={ canvasRef } className="absolute inset-0 pointer-events-none z-0" />;
}