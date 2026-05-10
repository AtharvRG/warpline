// src/utils/animations.js
import anime from 'animejs';

export const playSnapSpark = (x, y, container) => {
  const sparkCount = 6;
  const sparks = [];

  for (let i = 0; i < sparkCount; i++) {
    const p = document.createElement('div');
    p.style.position = 'absolute';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = '12px';
    p.style.height = '2px';
    p.style.backgroundColor = '#00e5ff';
    p.style.boxShadow = '0 0 10px #00e5ff';
    p.style.transformOrigin = 'left center';
    container.appendChild(p);
    sparks.push(p);
  }

  anime({
    targets: sparks,
    translateX: () => anime.random(-20, 20),
    translateY: () => anime.random(-20, 20),
    rotate: () => anime.random(0, 360),
    scaleX: [0, 1.5, 0],
    opacity: [1, 0],
    easing: 'easeOutExpo',
    duration: 500,
    complete: () => sparks.forEach(p => p.remove())
  });
};