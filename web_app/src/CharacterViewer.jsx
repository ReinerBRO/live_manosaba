import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Application, extend } from '@pixi/react';
import { Assets, Container, Sprite, Graphics } from 'pixi.js';
import * as PIXI from 'pixi.js';

// Register PixiJS components
extend({ Container, Sprite, Graphics });

// Map textual blend modes to PIXI constants
const BLEND_MODE_MAP = {
    'normal': "normal",
    'multiply': "multiply",
    'overlay': "overlay",
    'soft_light': "soft-light",
    'screen': "screen",
    'pass_through': "normal"
};
// Note: Pixi v8 handles blend modes as strings or objects. 
// "multiply", "screen", "overlay" are standard. 
// "soft-light" might be available or need custom.
// However, standard Pixi blend modes are Enums in PIXI.BLEND_MODES.
// But in JSX <sprite blendMode={...}> usually accepts the value.
// Let's use PIXI.BLEND_MODES values.

// Custom Hook for loading texture
const useTexture = (url) => {
    const [texture, setTexture] = useState(null);

    useEffect(() => {
        let active = true;

        const load = async () => {
            try {
                // Check if already in cache to avoid async flicker if possible (though Assets.load handles cache too)
                if (Assets.cache.has(url)) {
                    if (active) setTexture(Assets.cache.get(url));
                    return;
                }

                const tex = await Assets.load(url);
                if (active) setTexture(tex);
            } catch (err) {
                console.error("Failed to load texture:", url, err);
            }
        };

        load();
        return () => { active = false; };
    }, [url]);

    return texture;
};

const SpriteNode = React.forwardRef(({ texture, x, y, alpha, blendMode, mask }, ref) => (
    <pixiSprite
        ref={ref}
        texture={texture}
        x={x}
        y={y}
        alpha={alpha}
        blendMode={blendMode}
        mask={mask}
    />
));

const RenderNode = ({ node, viewState, charName, maskRef = null, setBaseRef = null, hasSeparateArms = false }) => {
    if (!node) return null;

    // Base visibility: layers are always allowed (selection controls visibility), groups respect PSD visible
    let isVisible = node.type === 'layer' ? true : node.visible !== false;
    if (!isVisible && node.type !== 'layer') return null; // skip hidden groups

    const opacity = node.opacity !== undefined ? node.opacity : 255;
    const alpha = opacity / 255.0;

    if (node.type === 'group' || node.type === 'root') {
        const children = node.children || [];
        const layerChildren = children.filter(c => c.type === 'layer');
        const groupChildren = children.filter(c => c.type === 'group');

        // Selector group: only layers, no sub-groups
        if (layerChildren.length > 0 && groupChildren.length === 0) {
            let selectedName = viewState[node._id];
            if (selectedName === null) return null; // explicit None
            if (!selectedName) {
                const visibleChild = layerChildren.find(c => c.visible);
                selectedName = visibleChild ? visibleChild.name : layerChildren[0].name;
            }
            const selectedLayer = layerChildren.find(c => c.name === selectedName) || layerChildren[0];
            if (!selectedLayer) return null;
            return (
                <pixiContainer alpha={alpha}>
                    <RenderNode
                        node={selectedLayer}
                        viewState={viewState}
                        charName={charName}
                        hasSeparateArms={hasSeparateArms}
                    />
                </pixiContainer>
            );
        }

        // Structure group: render children in order; handle clipping chains within the same level
        let clipBaseRef = null;
        const rendered = children.map((child, idx) => {
            const isLayer = child.type === 'layer';
            const isClipping = isLayer && child.clipping;

            const captureBase = (refObj) => {
                clipBaseRef = refObj;
            };

            // Non-layer resets clip chain
            if (!isLayer) {
                clipBaseRef = null;
            }

            return (
                <RenderNode
                    key={idx}
                    node={child}
                    viewState={viewState}
                    charName={charName}
                    maskRef={isClipping ? clipBaseRef : null}
                    setBaseRef={!isClipping && isLayer ? captureBase : null}
                    hasSeparateArms={hasSeparateArms}
                />
            );
        });

        return (
            <pixiContainer alpha={alpha}>
                {rendered}
            </pixiContainer>
        );
    }

    // Layer: always render (selected already handled by parent); ignore PSD visible flag here
    if (node.type === 'layer') {
        const isMaskOnly = node.name && node.name.toLowerCase().includes('clippingmask');
        const isMergedArms = node.name && node.name.toLowerCase().startsWith('arms');
        if (isMaskOnly) return null;
        if (isMergedArms && hasSeparateArms) return null; // avoid four arms
        const fullPath = `/resources/characters/${charName}/PSD/${node.image}`;
        const ref = useRef(null);
        const texture = useTexture(fullPath);

        // Map blend mode
        let blendMode = 'normal';
        if (node.blend_mode && BLEND_MODE_MAP[node.blend_mode.toLowerCase()]) {
            blendMode = BLEND_MODE_MAP[node.blend_mode.toLowerCase()];
        } else if (node.blend_mode) {
            blendMode = node.blend_mode.toLowerCase();
        }

        const x = node.offset ? node.offset.x : 0;
        const y = node.offset ? node.offset.y : 0;

        useEffect(() => {
            if (setBaseRef) setBaseRef(ref);
        }, [setBaseRef]);

        if (!texture) return null;

        return (
            <SpriteNode
                ref={ref}
                texture={texture}
                x={x}
                y={y}
                alpha={alpha}
                blendMode={blendMode}
                mask={maskRef ? maskRef.current : null}
            />
        );
    }

    return null;
};

// Extracted component to use the hook
const TextureLayer = ({ fullPath, node, alpha }) => {
    const texture = useTexture(fullPath);

    // Map blend mode
    let blendMode = 'normal';
    if (node.blend_mode && BLEND_MODE_MAP[node.blend_mode.toLowerCase()]) {
        blendMode = BLEND_MODE_MAP[node.blend_mode.toLowerCase()];
    } else if (node.blend_mode) {
        blendMode = node.blend_mode.toLowerCase();
    }

    if (!texture) return null; // Don't render until loaded

    const x = node.offset ? node.offset.x : 0;
    const y = node.offset ? node.offset.y : 0;

    return (
        <pixiSprite
            texture={texture}
            x={x}
            y={y}
            alpha={alpha}
            blendMode={blendMode}
        />
    );
};

// Helper hook for element size
const useElementSize = () => {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const observerRef = React.useRef(null);

    const refCallback = React.useCallback((node) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        if (node) {
            const observer = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const { width, height } = entry.contentRect;
                    setSize({ width, height });
                }
            });
            observer.observe(node);
            observerRef.current = observer;

            // Initial measure
            const rect = node.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        }
    }, []); // Empty deps, stable callback

    return [refCallback, size];
};

const CharacterViewer = ({ charName, model, viewState, lastAsset }) => {
    const [containerRef, parentSize] = useElementSize();
    const idMap = model?._idMap || {};
    const hasSeparateArms = useMemo(() => {
        return Object.entries(viewState).some(([k, v]) => {
            const node = idMap[k];
            if (!node) return false;
            const n = (node.name || '').toLowerCase();
            return v && (n.startsWith('arml') || n.startsWith('armr'));
        });
    }, [viewState, idMap]);

    // State for transform
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    // Initialize scale
    useEffect(() => {
        if (parentSize.width === 0 || !model) return;

        const modelHeight = model.canvas_size.height;
        const modelWidth = model.canvas_size.width;

        // Fit Height 90%
        const startScale = (parentSize.height * 0.9) / modelHeight;
        // Center
        const startX = (parentSize.width - (modelWidth * startScale)) / 2;
        const startY = (parentSize.height - (modelHeight * startScale)) / 2;

        // Only reset if completely way off or init (simple check: scale is default 1)
        // Or just let it reset on resize? Let's reset on model change only or init.
        // For now, simple: dependency on model.
        setTransform({ x: startX, y: startY, scale: startScale });
    }, [model, parentSize.width, parentSize.height]); // Triggers on resize too, keeping it centered. User can drag away.

    const handleWheel = (e) => {
        const zoomSensitivity = 0.001;
        const newScale = Math.max(0.05, Math.min(10, transform.scale - e.deltaY * zoomSensitivity));
        setTransform(prev => ({ ...prev, scale: newScale }));
    };

    const handlePointerDown = (e) => {
        setIsDragging(true);
        setLastPos({ x: e.clientX, y: e.clientY });
        e.currentTarget.setPointerCapture(e.pointerId); // Fix lost pointer events
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));
        setLastPos({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    // Log size changes for debugging
    useEffect(() => {
        if (parentSize.width || parentSize.height) {
            console.log('[CharacterViewer] container size', parentSize);
        }
    }, [parentSize.width, parentSize.height]);

    // Log view state changes
    useEffect(() => {
        console.log('[CharacterViewer] viewState', viewState);
    }, [viewState]);

    // Debug log once model loads
    useEffect(() => {
        if (model) {
            console.log('[CharacterViewer] model loaded', charName);
            // quick asset reachability test
            const testUrl = `/resources/characters/${charName}/PSD/parts/Body.png`;
            fetch(testUrl, { method: 'HEAD' })
                .then(res => console.log('[CharacterViewer] test asset HEAD', testUrl, res.status))
                .catch(err => console.warn('[CharacterViewer] test asset failed', err));
        }
    }, [model, charName]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                cursor: isDragging ? 'grabbing' : 'grab',
                background: '#fafafa',
                touchAction: 'none',
                position: 'relative' // For debug overlay
            }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* Debug Overlay */}
            <div style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(0,0,0,0.7)', color: '#0f0',
                padding: 10, pointerEvents: 'none', zIndex: 9999,
                fontFamily: 'monospace', fontSize: 12
            }}>
                Dimensions: {Math.round(parentSize.width)} x {Math.round(parentSize.height)}<br />
                Scale: {transform.scale.toFixed(3)}<br />
                Pos: {Math.round(transform.x)}, {Math.round(transform.y)}
                <br />
                <span style={{ color: '#fff' }}>viewState:</span>
                {Object.entries(viewState).map(([k, v]) => (
                    <div key={k}>{k}: <span style={{ color: '#0af' }}>{v ?? 'null'}</span></div>
                ))}
                {lastAsset && (
                    <>
                        <br />
                        <span style={{ color: '#fff' }}>Last asset:</span>
                        <div style={{ color: '#ffb347' }}>{lastAsset.label}</div>
                        {lastAsset.url && (
                            <img src={lastAsset.url} alt="last-asset" style={{ width: 100, border: '1px solid #555' }} />
                        )}
                    </>
                )}
            </div>
            {/* Debug DOM image to verify asset path (shows last clicked asset if available) */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 9999, background: '#fff', padding: 4, border: '1px solid #ccc' }}>
                <div style={{ fontSize: 12, color: '#333' }}>Asset check:</div>
                <img
                    src={lastAsset?.url || `/resources/characters/${charName}/PSD/parts/Body.png`}
                    alt="debug body"
                    style={{ width: 80, height: 'auto', display: 'block' }}
                    onError={() => console.warn('Debug img failed to load')}
                    onLoad={() => console.log('Debug img loaded')}
                />
            </div>

            {parentSize.width > 0 && (
                <Application
                    width={parentSize.width}
                    height={parentSize.height}
                    backgroundAlpha={0.1} // Slight background to see canvas
                    backgroundColor={0xff00ff} // Debug Pink to confirm render
                    preference="webgl" // force WebGL on browsers where WebGPU fails silently
                >
                    <pixiContainer
                        scale={transform.scale}
                        x={transform.x}
                        y={transform.y}
                    >
                        {/* Debug: draw a small rect to confirm PIXI renders */}
                        <pixiGraphics
                            draw={g => {
                                g.clear();
                                g.setFillStyle({ color: 0xff0000 });
                                g.rect(0, 0, 50, 50);
                                g.fill();
                            }}
                        />
                        <RenderNode
                            node={model.root}
                            viewState={viewState}
                            charName={charName}
                            hasSeparateArms={hasSeparateArms}
                        />
                    </pixiContainer>
                </Application>
            )}
        </div>
    );
};

export default CharacterViewer;
