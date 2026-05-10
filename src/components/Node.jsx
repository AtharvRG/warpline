// src/components/Node.jsx
import React, { useEffect, useRef, useState } from 'react';
import anime from 'animejs';

export default function Node({ node, updateBounds, onDelete, onStartConnect, locked, onDoubleClick, onTripleClick, zoom, onMorph, updateNodeData, onProcessChat, onProcessImage }) {
  const nodeRef = useRef(null);
  const chatScrollRef = useRef(null); 
  const fileInputRef = useRef(null); // Reference for hidden file input
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [morphTarget, setMorphTarget] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuAnimRef = useRef(null);

  const [chatInput, setChatInput] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');



  useEffect(() => {
    anime({
      targets: nodeRef.current, scale: [0.8, 1], opacity: [0, 1], duration: 1000, easing: 'easeOutElastic(1, .5)',
      complete: () => { if (nodeRef.current) nodeRef.current.style.transform = ''; }
    });
  }, []);

  useEffect(() => {
    if (node.type === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [node.data?.messages, node.type]);

  const handleDragStart = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (node.isDeleting || locked || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;

    setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = node.x;
    const initY = node.y;
    const currentZoom = zoom || 1;

    // FIX: Live tracking object to prevent closure slingshotting!
    const livePos = { x: initX, y: initY };

    const handlePointerMove = (moveEvent) => {
      const rawX = initX + (moveEvent.clientX - startX) / currentZoom;
      const rawY = initY + (moveEvent.clientY - startY) / currentZoom;

      const grid = 40;
      const snapX = Math.round(rawX / grid) * grid;
      const snapY = Math.round(rawY / grid) * grid;

      // Proximity snapping during drag (4px threshold as you requested)
      livePos.x = Math.abs(rawX - snapX) < 4 ? snapX : rawX;
      livePos.y = Math.abs(rawY - snapY) < 4 ? snapY : rawY;

      updateBounds(node.id, { x: livePos.x, y: livePos.y, w: node.w, h: node.h });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      // Final snap on release (8px threshold as you requested)
      const grid = 40;
      const finalSnapX = Math.round(livePos.x / grid) * grid;
      const finalSnapY = Math.round(livePos.y / grid) * grid;

      const finalX = Math.abs(livePos.x - finalSnapX) < 8 ? finalSnapX : livePos.x;
      const finalY = Math.abs(livePos.y - finalSnapY) < 8 ? finalSnapY : livePos.y;

      updateBounds(node.id, { x: finalX, y: finalY, w: node.w, h: node.h });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleResizeStart = (e, dir) => {
    e.preventDefault(); e.stopPropagation();
    if (node.isDeleting || locked) return; 

    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = node.x;
    const initY = node.y;
    const initW = node.w;
    const initH = node.h;
    const currentZoom = zoom || 1;

    const handlePointerMove = (moveEvent) => {
      let dx = (moveEvent.clientX - startX) / currentZoom;
      let dy = (moveEvent.clientY - startY) / currentZoom;
      let newX = initX, newY = initY, newW = initW, newH = initH;

      if (dir.includes('e')) newW = initW + dx;
      if (dir.includes('w')) { newW = initW - dx; newX = initX + dx; }
      if (dir.includes('s')) newH = initH + dy;
      if (dir.includes('n')) { newH = initH - dy; newY = initY + dy; }

      const minW = node.type === 'raw' ? 120 : 250;
      const minH = node.type === 'raw' ? 120 : 300;

      // Use raw sizing - snap only on release
      const newWClamped = Math.max(minW, newW);
      const newHClamped = Math.max(minH, newH);

      if (dir.includes('w')) newX = initX + (initW - newWClamped);
      if (dir.includes('n')) newY = initY + (initH - newHClamped);

      updateBounds(node.id, { x: newX, y: newY, w: newWClamped, h: newHClamped });
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      // Snap on release to nearest grid increment
      const snapW = Math.max(node.type === 'raw' ? 120 : 250, Math.round(node.w / 40) * 40);
      const snapH = Math.max(node.type === 'raw' ? 120 : 300, Math.round(node.h / 40) * 40);
      
      let finalX = node.x;
      if (node.w !== snapW) finalX = node.x + (node.w - snapW);
      
      updateBounds(node.id, { x: finalX, y: node.y, w: snapW, h: snapH });
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleSendChat = (e) => {
    if (e.key === 'Enter' && chatInput.trim()) {
      e.stopPropagation();
      const text = chatInput.trim();
      setChatInput(''); 
      if (onProcessChat) onProcessChat(node.id, text);
    }
  };

  const handleGenerateImage = (e) => {
    e.stopPropagation();
    if (imagePrompt.trim() && onProcessImage) {
      onProcessImage(node.id, imagePrompt.trim());
      setImagePrompt('');
    }
  };

  // --- NEW: FILE UPLOAD HANDLER ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      updateNodeData(node.id, { fileName: file.name, fileText: text });
    };
    reader.onerror = () => alert("Failed to read file.");
    
    // We only read text-based files right now (.txt, .csv, .md, code, etc)
    reader.readAsText(file);
  };

  const boxStyle = {
    left: node.x, top: node.y, width: node.w, height: node.h,
    willChange: 'left, top, width, height, box-shadow',
    transition: isResizing || isDragging ? 'none' : 'left 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.15s ease, height 0.15s ease, box-shadow 0.3s ease, border-color 0.3s ease'
  };

  const dynamicClasses = isDragging
    ? 'z-50 border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.4),_0_8px_30px_rgba(0,0,0,0.8)] scale-[0.98]'
    : 'z-10 border-[#333] hover:border-[#555] shadow-[0_4px_20px_rgba(0,0,0,0.6)] scale-100';

  const dragCursor = locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      ref={ nodeRef }
      data-id={ node.id }
      // Add 'group' here! Also updated to #09090b to match your dark canvas
      className={"group absolute bg-[#09090b] rounded-xl border react-node " + dynamicClasses}
      style={ boxStyle }
      onClick={(e) => { e.stopPropagation(); if (e.detail === 3 && onTripleClick) onTripleClick(node.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick && onDoubleClick(node.id); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setMorphTarget(null); }}
    >
      <div className={"absolute inset-0 rounded-xl z-[1] " + dragCursor} onPointerDown={ handleDragStart } />

      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none p-3">
        {node.type === 'raw' && (
          <div className="w-full h-full flex items-center justify-center text-white/5 text-xs font-mono select-none uppercase tracking-widest">Empty Node</div>
        )}
        
        {/* PREMIUM BLUE CHAT NODE */}
        {node.type === 'chat' && (
          <div className="w-full h-full flex flex-col bg-[#0f0f11] rounded-lg border border-blue-500/20 overflow-hidden pointer-events-auto shadow-inner">
            <div className="bg-[#131316] text-xs p-2.5 font-bold text-blue-400 border-b border-blue-500/20 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-2">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                 Agent Chat
               </div>
               <span className="text-[10px] font-mono text-gray-500 opacity-60">Llama-3.1</span>
            </div>
            
            <div ref={ chatScrollRef } className="flex-grow p-3 overflow-y-auto overflow-x-hidden flex flex-col gap-3 custom-scrollbar">
              {(node.data?.messages || []).length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-600 font-mono italic text-center px-4">Ready for input.</div>
              ) : (
                (node.data?.messages || []).map(msg => (
                  <div key={msg.id} className={"max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm " + (msg.role === 'user' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20 self-end rounded-tr-sm' : 'bg-[#18181b] text-gray-300 border border-white/5 self-start rounded-tl-sm')}>
                    {msg.isTyping ? (
                      <div className="flex gap-1 items-center h-4">
                        <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-2 bg-[#131316] border-t border-blue-500/20 shrink-0">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={ handleSendChat }
                placeholder="Type a message..." 
                className="w-full bg-[#09090b] text-gray-200 text-xs border border-white/5 rounded-md px-3 py-2 outline-none focus:border-blue-500/50 transition-all font-sans placeholder-gray-600"
              />
            </div>
          </div>
        )}

        {/* PREMIUM VIOLET IMAGE NODE */}
        {node.type === 'image' && (
          <div className="w-full h-full flex flex-col bg-[#0f0f11] rounded-lg border border-violet-500/20 overflow-hidden pointer-events-auto shadow-inner">
            <div className="bg-[#131316] text-xs p-2.5 font-bold text-violet-400 border-b border-violet-500/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Flux Studio
              </div>
              <span className="text-[10px] font-mono text-gray-500 opacity-60">Schnell</span>
            </div>
            
            <div className="flex-grow p-2 overflow-y-auto flex flex-col gap-2 relative bg-[#09090b]/50">
              {node.data?.isGenerating && (
                <div className="absolute inset-0 bg-[#09090b]/60 z-20 flex items-center justify-center backdrop-blur-sm rounded-md">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className="w-full aspect-square bg-[#131316] rounded-md border border-white/5 flex items-center justify-center overflow-hidden shadow-inner">
                {node.data?.currentImage ? (
                  <img src={node.data.currentImage} alt="Generated" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-gray-600 font-mono">No image rendered</span>
                )}
              </div>
            </div>

            <div className="p-2 bg-[#131316] border-t border-violet-500/20 flex flex-col gap-2 shrink-0">
              <textarea 
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe an image..." 
                rows="2"
                className="w-full bg-[#09090b] text-gray-200 text-xs border border-white/5 rounded-md px-2 py-1.5 outline-none focus:border-violet-500/50 transition-all font-sans resize-none placeholder-gray-600"
              />
              <button 
                onClick={handleGenerateImage}
                disabled={node.data?.isGenerating || !imagePrompt.trim()}
                className="w-full bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold py-1.5 rounded transition-colors"
              >
                Generate Image
              </button>
            </div>
          </div>
        )}

        {/* PREMIUM TEAL INPUT NODE */}
        {node.type === 'input' && (
          <div className="w-full h-full flex flex-col bg-[#0f0f11] rounded-lg border border-teal-500/20 overflow-hidden pointer-events-auto shadow-inner">
            <div className="bg-[#131316] text-xs p-2.5 font-bold text-teal-400 border-b border-teal-500/20 flex items-center gap-2 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              Source Document
            </div>
            <div 
              className="flex-grow p-3 text-xs flex flex-col items-center justify-center text-center gap-3 hover:bg-teal-500/5 cursor-pointer transition-colors relative"
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.csv,.md,.json,.js,.py,.jsx"/>
              {node.data?.fileName ? (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-teal-500" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                  <span className="text-teal-400 font-bold truncate w-full px-2">{node.data.fileName}</span>
                  <span className="text-[10px] text-gray-500 font-mono">Loaded ({node.data.fileText?.length} chars)</span>
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
                  <span className="text-gray-500 font-mono text-[10px]">Click to map file<br/>(.txt, .csv, .md)</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {node.type === 'raw' && (
        <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
          {/* FIXED: Added opacity-0 group-hover:opacity-100 to hide unless hovered! */}
          <button 
            className={`w-12 h-12 bg-[#18181b] border border-white/10 rounded-full shadow-2xl flex items-center justify-center text-gray-400 hover:text-white hover:border-white/30 transition-all pointer-events-auto z-50 hover:scale-110 active:scale-95 ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>

          <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${isMenuOpen ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute flex items-center justify-center pointer-events-none" style={{ left: '50%', top: '50%', width: '160px', height: '160px', transform: `translate(-50%, -50%) scale(${isMenuOpen ? 1 : 0.3}) rotate(${isMenuOpen ? 0 : -90}deg)`, transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
              <div className="absolute inset-0 border-[32px] border-[#09090b]/80 backdrop-blur-md rounded-full shadow-2xl"></div>
              <svg className="absolute w-full h-full opacity-20 animate-[spin_20s_linear_infinite]" viewBox="0 0 160 160"><circle cx="80" cy="80" r="65" fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 8" /></svg>
            </div>
            
            {/* Donut Buttons - Updated to professional colors */}
            <button className="absolute w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-500/20 hover:scale-110 transition-all pointer-events-auto shadow-lg z-50"
              style={{ left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(0, ${isMenuOpen ? '-65px' : '0px'})`, transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); if(onMorph) onMorph(node.id, 'chat'); updateBounds(node.id, { x: node.x, y: node.y, w: Math.max(node.w, 320), h: Math.max(node.h, 450) }); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>

            <button className="absolute w-10 h-10 bg-violet-500/10 border border-violet-500/30 rounded-full flex items-center justify-center text-violet-400 hover:bg-violet-500/20 hover:scale-110 transition-all pointer-events-auto shadow-lg z-50"
              style={{ left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${isMenuOpen ? '56px' : '0px'}, ${isMenuOpen ? '32.5px' : '0px'})`, transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.05s' }}
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); if(onMorph) onMorph(node.id, 'image'); updateBounds(node.id, { x: node.x, y: node.y, w: Math.max(node.w, 320), h: Math.max(node.h, 450) }); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            </button>

            <button className="absolute w-10 h-10 bg-teal-500/10 border border-teal-500/30 rounded-full flex items-center justify-center text-teal-400 hover:bg-teal-500/20 hover:scale-110 transition-all pointer-events-auto shadow-lg z-50"
              style={{ left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${isMenuOpen ? '-56px' : '0px'}, ${isMenuOpen ? '32.5px' : '0px'})`, transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s' }}
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); if(onMorph) onMorph(node.id, 'input'); updateBounds(node.id, { x: node.x, y: node.y, w: Math.max(node.w, 320), h: Math.max(node.h, 450) }); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
            </button>
          </div>
        </div>
      )}

      {/* PREMIUM CLOSE BUTTON - Floats outside top right, shows on hover */}
      {!locked && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(node.id, nodeRef.current, node.x + node.w / 2, node.y + node.h / 2); }}
          className="absolute -top-3 -right-3 w-7 h-7 bg-[#18181b] border border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all z-50 opacity-0 group-hover:opacity-100 shadow-xl"
          title="Delete Node"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      )}

      {/* PREMIUM CONNECT PORT - Center right edge, massive hit area */}
      {!locked && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            if (node.isDeleting) return;
            const rect = e.target.getBoundingClientRect();
            onStartConnect(node.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
          }}
          className="absolute top-1/2 -right-4 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-crosshair z-50 group/port"
          title="Drag to Connect"
        >
          {/* The visible dot */}
          <div className="w-3.5 h-3.5 bg-[#27272a] border-2 border-white/20 rounded-full group-hover/port:bg-white group-hover/port:border-white group-hover/port:scale-125 group-hover/port:shadow-[0_0_12px_rgba(255,255,255,0.6)] transition-all duration-200"></div>
        </div>
      )}

      {!locked && (
        <>
          <div className="absolute -top-1 left-2 right-2 h-2 cursor-ns-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'n')} />
          <div className="absolute -bottom-1 left-2 right-2 h-2 cursor-ns-resize z-20" onPointerDown={(e) => handleResizeStart(e, 's')} />
          <div className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'w')} />
          <div className="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'e')} />
          <div className="absolute -top-2 -left-2 w-4 h-4 cursor-nwse-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="absolute -top-2 -right-2 w-4 h-4 cursor-nesw-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 cursor-nesw-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'sw')} />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 cursor-nwse-resize z-20" onPointerDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

      {locked && (
        <div className="absolute top-3 left-3 w-3 h-3 opacity-30 z-30 pointer-events-none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
    </div>
  );
}