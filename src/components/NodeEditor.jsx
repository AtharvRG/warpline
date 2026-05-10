// src/components/NodeEditor.jsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import anime from 'animejs';
import localforage from 'localforage';
import CanvasGrid from './CanvasGrid';
import Node from './Node';
import { playSnapSpark } from '../utils/animations';
import { getLineIntersection, getRectIntersection, getOrthogonalPoints } from '../utils/math';

export default function NodeEditor() {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [draftConnection, setDraftConnection] = useState(null);
  const [slicePath, setSlicePath] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [nimApiKey, setNimApiKey] = useState('');

  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const transformWrapperRef = useRef(null);
  const [displayZoom, setDisplayZoom] = useState(100);
  const [showFitLabel, setShowFitLabel] = useState(false);
  const zoomAnimRef = useRef(null);

  const applyTransform = useCallback(() => {
    if (transformWrapperRef.current) {
      transformWrapperRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
    }
  }, []);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);

  useEffect(() => { spaceHeldRef.current = spaceHeld; }, [spaceHeld]);

  const containerRef = useRef(null);
  const isMouseDown = useRef(false);
  const [isSlicing, setIsSlicing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false); 
  const clickStartPos = useRef({ x: 0, y: 0 });
  
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const savedNodes = await localforage.getItem('warpline_nodes');
        const savedConns = await localforage.getItem('warpline_connections');
        const savedPan = await localforage.getItem('warpline_pan');
        const savedZoom = await localforage.getItem('warpline_zoom');
        const savedKey = await localforage.getItem('warpline_nim_key');
        
        if (savedNodes) setNodes(savedNodes);
        if (savedConns) setConnections(savedConns);
        if (savedPan) { panRef.current = savedPan; }
        if (savedZoom) { zoomRef.current = savedZoom; }
        if (savedKey) setNimApiKey(savedKey);
      } catch (err) {
        console.error("Failed to load workspace", err);
      }
      setIsLoaded(true);
    }
    loadWorkspace();
  }, []);

  // FIX 1: Ensure transform is applied exactly when loading finishes and wrapper mounts!
  useEffect(() => {
    if (isLoaded) {
      setDisplayZoom(Math.round(zoomRef.current * 100));
      applyTransform();
    }
  }, [isLoaded, applyTransform]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('warpline_nodes', nodes);
    localforage.setItem('warpline_connections', connections);
    localforage.setItem('warpline_pan', panRef.current);
    localforage.setItem('warpline_zoom', zoomRef.current);
    localforage.setItem('warpline_nim_key', nimApiKey);
  }, [nodes, connections, nimApiKey, isLoaded]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { 
        e.preventDefault(); setSpaceHeld(true); 
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') { 
        setSpaceHeld(false); 
        setIsPanning(false); 
        isPanningRef.current = false; 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

  // FIX 2: High-performance Mouse Scroll & Zoom Hijacking with Smooth Animation
  useEffect(() => {
    const handleWheel = (e) => {
      if (!containerRef.current) return;
      
      // Only prevent default if we're over the canvas area
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const isOverContainer = e.clientX >= rect.left && e.clientX <= rect.right && 
                             e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if (!isOverContainer) return;
      
      e.preventDefault();
      e.stopPropagation();

      if (zoomAnimRef.current) zoomAnimRef.current.pause();

      if (e.ctrlKey || e.metaKey) {
        // SMOOTH ZOOMING with animation
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomTarget = Math.exp(-e.deltaY * 0.005);
        const newZoom = Math.max(0.15, Math.min(4, zoomRef.current * zoomTarget));
        
        const animObj = { z: zoomRef.current, px: panRef.current.x, py: panRef.current.y };
        zoomAnimRef.current = anime({
          targets: animObj,
          z: newZoom,
          duration: 350,
          easing: 'easeOutExpo',
          update: () => {
            const scale = animObj.z / zoomRef.current;
            panRef.current = {
              x: mouseX - (mouseX - animObj.px) * (animObj.z / zoomRef.current),
              y: mouseY - (mouseY - animObj.py) * (animObj.z / zoomRef.current)
            };
            zoomRef.current = animObj.z;
            setDisplayZoom(Math.round(animObj.z * 100));
            setShowFitLabel(false);
            applyTransform();
          }
        });
      } else {
        // SMOOTH PANNING (Like Figma) with animation
        const animObj = { px: panRef.current.x, py: panRef.current.y };
        zoomAnimRef.current = anime({
          targets: animObj,
          px: panRef.current.x - e.deltaX,
          py: panRef.current.y - e.deltaY,
          duration: 300,
          easing: 'easeOutExpo',
          update: () => {
            panRef.current = { x: animObj.px, y: animObj.py };
            setDisplayZoom(Math.round(zoomRef.current * 100));
            setShowFitLabel(false);
            applyTransform();
          }
        });
      }
    };
    
    // Attach to window to catch all wheel events
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [applyTransform]);

  const screenToCanvas = useCallback((screenX, screenY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left - panRef.current.x) / zoomRef.current,
      y: (screenY - rect.top - panRef.current.y) / zoomRef.current
    };
  }, []);

  const isOverlappingNode = useCallback((cx, cy, threshold = 30) => {
    return nodesRef.current.some(n => {
      if (n.isDeleting) return false;
      return cx > n.x - threshold && cx < n.x + n.w + threshold &&
             cy > n.y - threshold && cy < n.y + n.h + threshold;
    });
  }, []);

  const updateNodeBounds = useCallback((id, bounds) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...bounds } : n));
  }, []);

  const toggleNodeLock = useCallback((id) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, isLocked: !n.isLocked } : n));
  }, []);

  // FIX 3: True Lock/Unlock All Logic
  const isAllLocked = nodes.length > 0 && nodes.every(n => n.isLocked);
  const handleToggleLockAll = useCallback(() => {
    const targetState = !isAllLocked;
    setNodes(prev => prev.map(n => ({ ...n, isLocked: targetState })));
  }, [isAllLocked]);

  const handleMorphNode = useCallback((id, newType) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== id) return n;
      let initialData = {};
      if (newType === 'chat') initialData = { messages: [], summary: "" };
      if (newType === 'image') initialData = { prompt: "", currentImage: null, isGenerating: false, history: [] };
      if (newType === 'input') initialData = { fileName: "", fileText: "" };
      return { ...n, type: newType, data: initialData };
    }));
  }, []);

  const updateNodeData = useCallback((id, newData) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
  }, []);

  const getUpstreamContext = useCallback((targetNodeId, visited = new Set()) => {
    if (visited.has(targetNodeId)) return ""; 
    visited.add(targetNodeId);
    
    const incomingConns = connectionsRef.current.filter(c => c.to === targetNodeId);
    let contextStr = "";
    
    for (const conn of incomingConns) {
      const upstreamNode = nodesRef.current.find(n => n.id === conn.from);
      if (upstreamNode) {
        if (upstreamNode.type === 'chat') {
          contextStr += "\n[Context from Connected Chat]:\n";
          const msgs = upstreamNode.data?.messages || [];
          contextStr += msgs.filter(m => !m.isTyping).map(m => m.role + ": " + m.content).join('\n') + "\n";
        }
        if (upstreamNode.type === 'input') {
          contextStr += "\n[Context from Uploaded Document]:\n";
          contextStr += (upstreamNode.data?.fileText || "(Empty Source)") + "\n";
        }
        contextStr += getUpstreamContext(upstreamNode.id, visited);
      }
    }
    return contextStr;
  }, []);

  const handleProcessChat = useCallback(async (nodeId, userInput) => {
    if (!nimApiKey) { alert("Please set your Nvidia NIM API Key in the settings first."); return; }

    const userMsg = { id: Date.now(), role: 'user', content: userInput };
    const tempAiMsg = { id: Date.now() + 1, role: 'assistant', content: 'Thinking...', isTyping: true };

    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, messages: [...(n.data.messages || []), userMsg, tempAiMsg] } } : n));

    const upstreamContext = getUpstreamContext(nodeId);
    const systemPrompt = upstreamContext 
      ? "You are a helpful AI assistant. Use the following context from connected upstream nodes to inform your answers if relevant.\n\n" + upstreamContext
      : "You are a helpful AI assistant.";

    const targetNode = nodesRef.current.find(n => n.id === nodeId);
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...(targetNode?.data?.messages || []).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userInput }
    ];

    try {
      const response = await fetch('/api/nvidia-chat/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': "Bearer " + nimApiKey.trim() },
        body: JSON.stringify({ model: "meta/llama-3.1-8b-instruct", messages: apiMessages, max_tokens: 1024, temperature: 0.7 })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error ${response.status}: ${errorData.detail || response.statusText}`);
      }
      
      const data = await response.json();
      const aiContent = data.choices[0].message.content;

      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        const msgs = n.data.messages.map(m => m.id === tempAiMsg.id ? { ...m, content: aiContent, isTyping: false } : m);
        const newSummary = (n.data.summary || "") + "\nUser: " + userInput + "\nAI: " + aiContent;
        return { ...n, data: { ...n.data, messages: msgs, summary: newSummary } };
      }));
    } catch (err) {
      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        const msgs = n.data.messages.map(m => m.id === tempAiMsg.id ? { ...m, content: "⚠️ " + err.message, isTyping: false } : m);
        return { ...n, data: { ...n.data, messages: msgs } };
      }));
    }
  }, [nimApiKey, getUpstreamContext]);

  const handleProcessImage = useCallback(async (nodeId, userPrompt) => {
    if (!nimApiKey) { alert("Please set your Nvidia NIM API Key in the settings first."); return; }

    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: true } } : n));
    const upstreamContext = getUpstreamContext(nodeId);
    
    const cleanContext = upstreamContext ? upstreamContext.replace(/\n/g, ' ').substring(0, 150) : "";
    const finalPrompt = cleanContext 
      ? `Context: ${cleanContext}. Generate: ${userPrompt}`.substring(0, 450)
      : userPrompt.substring(0, 450);

    try {
      const response = await fetch('/api/nvidia-image/v1/genai/black-forest-labs/flux.2-klein-4b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': "Bearer " + nimApiKey.trim(),
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          width: 1024,
          height: 1024,
          seed: Math.floor(Math.random() * 100000), 
          steps: 4
        })
      });

      if (!response.ok) {
        let errBody = await response.text();
        throw new Error(`Status ${response.status}: ${errBody}`);
      }
      
      const data = await response.json();
      
      let rawBase64 = null;
      if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        rawBase64 = data.artifacts[0].base64;
      }
      if (!rawBase64) throw new Error("Nvidia API rejected generation: " + JSON.stringify(data));

      const base64Image = rawBase64.startsWith('data:image') ? rawBase64 : "data:image/jpeg;base64," + rawBase64;

      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n;
        const newHistory = [{ prompt: userPrompt, img: base64Image }, ...(n.data.history || [])];
        return { ...n, data: { ...n.data, isGenerating: false, currentImage: base64Image, history: newHistory } };
      }));

    } catch (err) {
      console.error("Image Gen Error:", err);
      alert("Failed to generate image: " + err.message);
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: false } } : n));
    }
  }, [nimApiKey, getUpstreamContext]);

  const handleDeleteNode = useCallback((id, nodeElement, centerX, centerY) => {
    const nodeToDel = nodes.find(n => n.id === id);
    if (!nodeToDel || nodeToDel.isDeleting) return;

    let targetForAnime;
    setNodes(prev => prev.map(n => {
      if (n.id === id) { const cloned = { ...n, isDeleting: true }; targetForAnime = cloned; return cloned; }
      return n;
    }));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    
    if (nodeElement) { anime({ targets: nodeElement, scale: 0.5, opacity: 0, duration: 400, easing: 'easeInBack' }); }

    setTimeout(() => {
      if (targetForAnime) {
        anime({
          targets: targetForAnime, warpScale: 0, glowRadius: 0.1, duration: 400, easing: 'easeOutQuad',
          complete: () => { setNodes(prev => prev.filter(n => n.id !== id)); }
        });
      }
    }, 0);
  }, [nodes]);

  const handleExport = useCallback(() => {
    const exportNodes = nodes.map(n => {
      const cleanNode = { ...n };
      if (cleanNode.type === 'image' && cleanNode.data) {
        cleanNode.data = { ...cleanNode.data, currentImage: null };
        if (cleanNode.data.history) {
          cleanNode.data.history = cleanNode.data.history.map(h => ({ prompt: h.prompt, img: null }));
        }
      }
      return cleanNode;
    });

    const payload = {
      version: "1.0",
      nodes: exportNodes,
      connections: connections,
      pan: panRef.current,
      zoom: zoomRef.current
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "workspace.warpline");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }, [nodes, connections]);

  const handleImport = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (!importedData.nodes || !importedData.connections) throw new Error("Invalid file format");

        setNodes(importedData.nodes);
        setConnections(importedData.connections);
        if (importedData.pan) { panRef.current = importedData.pan; }
        if (importedData.zoom) { zoomRef.current = importedData.zoom; }
        applyTransform();

        await localforage.setItem('warpline_nodes', importedData.nodes);
        await localforage.setItem('warpline_connections', importedData.connections);
        e.target.value = null; 
      } catch (err) {
        alert("Failed to import workspace. The file might be corrupted.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  }, [applyTransform]);

  const handleZoomToNodes = useCallback(() => {
    const currentNodes = nodesRef.current.filter(n => !n.isDeleting);
    if (currentNodes.length === 0 || !containerRef.current) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    currentNodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });

    const rect = containerRef.current.getBoundingClientRect();
    const padding = 100;
    const bboxW = maxX - minX + padding * 2;
    const bboxH = maxY - minY + padding * 2;
    const bboxCx = (minX + maxX) / 2;
    const bboxCy = (minY + maxY) / 2;

    const targetZoom = Math.max(0.3, Math.min(1.2, Math.min(rect.width / bboxW, rect.height / bboxH)));
    const targetPanX = rect.width / 2 - bboxCx * targetZoom;
    const targetPanY = rect.height / 2 - bboxCy * targetZoom;

    if (zoomAnimRef.current) zoomAnimRef.current.pause();

    const animObj = { px: panRef.current.x, py: panRef.current.y, z: zoomRef.current };
    zoomAnimRef.current = anime({
      targets: animObj,
      px: targetPanX,
      py: targetPanY,
      z: targetZoom,
      duration: 600,
      easing: 'easeOutCubic',
      update: () => {
        panRef.current = { x: animObj.px, y: animObj.py };
        zoomRef.current = animObj.z;
        setDisplayZoom(Math.round(animObj.z * 100));
        setShowFitLabel(true);
        applyTransform();
      }
    });
  }, [applyTransform]);

  const handleMouseDown = (e) => {
    if (e.target.closest('.editor-ui-controls') || e.target.closest('.react-node') || e.target.closest('.settings-modal')) return;

    if (e.button === 1 || spaceHeldRef.current) {
      e.preventDefault(); 
      setIsPanning(true);
      isPanningRef.current = true;
      clickStartPos.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      return;
    }

    isMouseDown.current = true;
    setIsSlicing(true);
    clickStartPos.current = { x: e.clientX, y: e.clientY };
    setSlicePath([{ x: e.clientX, y: e.clientY }]);
  };

  const handleStartConnect = useCallback((nodeId, startX, startY) => {
    const canvasStart = screenToCanvas(startX, startY);
    setDraftConnection({ from: nodeId, startX: canvasStart.x, startY: canvasStart.y, endX: canvasStart.x, endY: canvasStart.y, targetId: null });
  }, [screenToCanvas]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isPanningRef.current) {
        panRef.current = { x: e.clientX - clickStartPos.current.x, y: e.clientY - clickStartPos.current.y };
        applyTransform();
        return;
      }

      if (draftConnection) {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        let targetX = canvasPos.x;
        let targetY = canvasPos.y;
        let hoveredTarget = null;

        const sourceNode = nodesRef.current.find(sn => sn.id === draftConnection.from);

        nodesRef.current.forEach(n => {
          if (n.isDeleting) return;
          
          // --- STRICT GRAPH BUSINESS LOGIC ---
          let isValid = true;
          // 1. Cannot connect to itself
          if (n.id === draftConnection.from) isValid = false;
          // 2. Source/Input nodes cannot RECEIVE connections
          if (n.type === 'input') isValid = false;
          // 3. Image nodes cannot SEND connections
          if (sourceNode?.type === 'image') isValid = false;
          // 4. Cannot duplicate an exact existing connection
          if (connectionsRef.current.some(c => c.from === draftConnection.from && c.to === n.id)) isValid = false;

          const cx = n.x + n.w / 2;
          const cy = n.y + n.h / 2;
          
          // Only snap if the connection is valid according to the rules
          if (isValid && Math.hypot(cx - canvasPos.x, cy - canvasPos.y) < Math.max(n.w, n.h) * 0.4) {
            hoveredTarget = n.id;
          }
        });

        if (hoveredTarget) {
          const hNode = nodesRef.current.find(n => n.id === hoveredTarget);
          targetX = hNode.x + hNode.w / 2;
          targetY = hNode.y + hNode.h / 2;
        }

        setDraftConnection(prev => {
          if (prev.endX === targetX && prev.endY === targetY && prev.targetId === hoveredTarget) return prev;
          return { ...prev, endX: targetX, endY: targetY, targetId: hoveredTarget };
        });
        return;
      }

      if (isMouseDown.current) {
        setSlicePath(prev => {
          const newPath = [...prev, { x: e.clientX, y: e.clientY }];
          if (newPath.length > 8) newPath.shift();

          if (newPath.length > 1) {
            const p1 = newPath[newPath.length - 2];
            const p2 = newPath[newPath.length - 1];

            setConnections(currentConns => {
              return currentConns.filter(conn => {
                const nFrom = nodes.find(n => n.id === conn.from);
                const nTo = nodes.find(n => n.id === conn.to);
                if (!nFrom || !nTo || nFrom.isDeleting || nTo.isDeleting || nFrom.isLocked || nTo.isLocked) return true;

                const start = getRectIntersection(nFrom, { x: nTo.x + nTo.w / 2, y: nTo.y + nTo.h / 2 });
                const end = getRectIntersection(nTo, { x: nFrom.x + nFrom.w / 2, y: nFrom.y + nFrom.h / 2 });
                const pts = getOrthogonalPoints(start, end, nodes);

                let isHit = false;
                for (let i = 0; i < pts.length - 1; i++) {
                  const sp0 = { x: pts[i].x * zoomRef.current + panRef.current.x, y: pts[i].y * zoomRef.current + panRef.current.y };
                  const sp1 = { x: pts[i + 1].x * zoomRef.current + panRef.current.x, y: pts[i + 1].y * zoomRef.current + panRef.current.y };

                  const hit = getLineIntersection(p1, p2, sp0, sp1);
                  if (hit) {
                    playSnapSpark(hit.x, hit.y, containerRef.current);
                    anime({ targets: ['[data-id="' + conn.from + '"]', '[data-id="' + conn.to + '"]'], scale: [1, 0.95, 1.05, 1], duration: 400 });
                    isHit = true; break;
                  }
                }
                return !isHit;
              });
            });
          }
          return newPath;
        });
      }
    };

    const handleMouseUp = (e) => {
      if (isPanningRef.current) { 
        setIsPanning(false); 
        isPanningRef.current = false;
        return; 
      }

      if (draftConnection) {
        let finalTargetId = draftConnection.targetId;
        const sourceNode = nodesRef.current.find(n => n.id === draftConnection.from);

        if (!finalTargetId && sourceNode) {
          const endPos = { x: draftConnection.endX, y: draftConnection.endY };
          const sourceCx = sourceNode.x + sourceNode.w / 2;
          const sourceCy = sourceNode.y + sourceNode.h / 2;

          if (Math.hypot(endPos.x - sourceCx, endPos.y - sourceCy) < Math.max(sourceNode.w, sourceNode.h) * 0.8) {
            setDraftConnection(null); return;
          }

          // Spawning a new node from a drag is only allowed if the source isn't an image node
          if (sourceNode.type !== 'image' && !isOverlappingNode(endPos.x, endPos.y, 20)) {
            finalTargetId = "node-" + Date.now();
            const newNode = { id: finalTargetId, x: endPos.x - 60, y: endPos.y - 60, w: 120, h: 120, warpScale: 0, glowRadius: 0.1, isLocked: false, type: 'raw', data: {} };
            setNodes(prev => {
              anime({ targets: newNode, warpScale: 1, glowRadius: 220, duration: 1200, easing: 'easeOutElastic(1, .6)' });
              return [...prev, newNode];
            });
          } else { 
            setDraftConnection(null); 
            return; 
          }
        }

        if (finalTargetId) {
          // Double check rule: Image nodes cannot output, Input nodes cannot receive
          const targetNode = nodesRef.current.find(n => n.id === finalTargetId);
          const isTargetInput = targetNode?.type === 'input';
          const isSourceImage = sourceNode?.type === 'image';

          if (!isTargetInput && !isSourceImage) {
            setConnections(prev => {
              if (prev.find(c => c.from === draftConnection.from && c.to === finalTargetId)) return prev;
              return [...prev, { id: "conn-" + Date.now(), from: draftConnection.from, to: finalTargetId }];
            });
            const rect = containerRef.current.getBoundingClientRect();
            playSnapSpark(draftConnection.endX * zoomRef.current + panRef.current.x + rect.left, draftConnection.endY * zoomRef.current + panRef.current.y + rect.top, containerRef.current);
          }
        }
        setDraftConnection(null);
      }

      if (isMouseDown.current) {
        isMouseDown.current = false; setIsSlicing(false);
        if (Math.hypot(e.clientX - clickStartPos.current.x, e.clientY - clickStartPos.current.y) < 5 && !e.target.closest('.react-node') && !e.target.closest('.editor-ui-controls')) {
          const canvasPos = screenToCanvas(e.clientX, e.clientY);
          const snappedX = Math.round((canvasPos.x - 60) / 40) * 40;
          const snappedY = Math.round((canvasPos.y - 60) / 40) * 40;

          if (!isOverlappingNode(canvasPos.x, canvasPos.y, 20)) {
            const newNode = { id: "node-" + Date.now(), x: snappedX, y: snappedY, w: 120, h: 120, warpScale: 0, glowRadius: 0.1, isLocked: false, type: 'raw', data: {} };
            setNodes(prev => {
              anime({ targets: newNode, warpScale: 1, glowRadius: 220, duration: 1200, easing: 'easeOutElastic(1, .6)' });
              return [...prev, newNode];
            });
          }
        }
        setSlicePath([]);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [draftConnection, nodes, screenToCanvas, isOverlappingNode, applyTransform]);

  if (!isLoaded) return <div className="w-screen h-screen bg-[#09090b] flex items-center justify-center text-[#555] font-mono">Initializing Neural Link...</div>;

  return (
    <div ref={ containerRef } className={"relative w-screen h-screen bg-[#09090b] overflow-hidden " + (isPanning || spaceHeld ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : isSlicing && !draftConnection ? 'cursor-crosshair' : 'cursor-default')} onMouseDown={ handleMouseDown }>
      <CanvasGrid nodes={ nodes } connections={ connections } draftConnection={ draftConnection } slicePath={ slicePath } panRef={ panRef } zoomRef={ zoomRef } />

      <div ref={ transformWrapperRef } style={{ transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', willChange: 'transform' }}>
        <div style={{ pointerEvents: 'auto' }}>
          {nodes.map(node => (
            <Node
              key={ node.id }
              node={ node }
              updateBounds={ updateNodeBounds }
              onDelete={ handleDeleteNode }
              onStartConnect={ handleStartConnect }
              locked={ node.isLocked }
              onDoubleClick={ handleZoomToNodes }
              onTripleClick={ toggleNodeLock }
              zoomRef={ zoomRef }
              onMorph={ handleMorphNode }
              updateNodeData={ updateNodeData }
              onProcessChat={ handleProcessChat }
              onProcessImage={ handleProcessImage }
            />
          ))}
        </div>
      </div>

      <div className="editor-ui-controls absolute top-4 left-4 flex gap-2 z-50" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={handleToggleLockAll}
          className={"w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border backdrop-blur-xl " + (isAllLocked ? 'bg-yellow-500/20 border-yellow-500/50 shadow-[0_0_16px_rgba(234,179,8,0.25)]' : 'bg-[#18181b]/80 border-white/5 hover:bg-white/10 hover:border-white/10')}
          title={isAllLocked ? 'Unlock all nodes' : 'Lock all nodes'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isAllLocked ? 'text-yellow-400' : 'text-gray-400'}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d={isAllLocked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"} /></svg>
        </button>
        <button 
          onClick={handleZoomToNodes} 
          className="h-10 px-3 rounded-xl bg-[#18181b]/80 border border-white/5 backdrop-blur-xl flex items-center text-xs text-gray-400 font-mono select-none hover:bg-white/10 hover:border-white/10 hover:text-white transition-all duration-300 cursor-pointer" 
          title={showFitLabel ? "Click to reset zoom" : "Current zoom level"}
        >
          {showFitLabel ? 'Fit' : `${displayZoom}%`}
        </button>
        
        <button
          onClick={handleExport}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border backdrop-blur-xl bg-[#18181b]/80 border-white/5 hover:bg-white/10 hover:border-white/10 text-gray-400 hover:text-[#00e5ff]"
          title="Export Workspace (.warpline)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </button>

        <label className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border backdrop-blur-xl bg-[#18181b]/80 border-white/5 hover:bg-white/10 hover:border-white/10 text-gray-400 hover:text-emerald-400 cursor-pointer" title="Import Workspace (.warpline)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <input type="file" accept=".warpline,.json" className="hidden" onChange={handleImport} />
        </label>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border backdrop-blur-xl bg-[#18181b]/80 border-white/5 hover:bg-white/10 hover:border-white/10 text-gray-400 hover:text-white"
          title="Settings & API Keys"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      {isSettingsOpen && (
        <div className="settings-modal absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center" onMouseDown={() => setIsSettingsOpen(false)}>
          <div className="bg-[#09090b] border border-white/10 rounded-2xl w-96 p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
              Warpline Config
            </h2>
            <div className="mb-6">
              <label className="text-xs text-gray-400 font-mono mb-2 block">Nvidia NIM API Key</label>
              <input 
                type="password" 
                value={nimApiKey} 
                onChange={(e) => setNimApiKey(e.target.value)} 
                placeholder="nvapi-..."
                className="w-full bg-[#18181b] text-white border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00e5ff] transition-colors"
              />
            </div>
            <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-white text-black font-bold py-2 rounded-lg hover:bg-gray-200 transition-colors">Save & Close</button>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-8 text-gray-400 max-w-sm pointer-events-none select-none z-10">
        <h1 className="text-white font-bold text-xl mb-2 tracking-tight">Warpline</h1>
        <p className="text-xs leading-relaxed text-gray-500 font-mono">Agentic Graph Environment</p>
      </div>
    </div>
  );
}