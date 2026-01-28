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

const RenderNode = ({ node, viewState, charName, maskRef = null, setBaseRef = null, hasSeparateArms = false, hasMergedArms = false, activeMergedArmName = null, activeArmRName = null }) => {
    if (!node) return null;

    // Base visibility: layers are always allowed (selection controls visibility), groups respect PSD visible
    // UNLESS the group is managed by viewState (has a selector), in which case we let the selection logic decide.
    const isManaged = viewState[node._id] !== undefined;
    let isVisible = node.type === 'layer' ? true : (isManaged ? true : node.visible !== false);
    if (!isVisible && node.type !== 'layer') return null; // skip hidden groups

    const opacity = node.opacity !== undefined ? node.opacity : 255;
    const alpha = opacity / 255.0;

    if (node.type === 'group' || node.type === 'root') {
        const n = (node.name || '').toLowerCase();
        // STRONG EXCLUSION: If Merged Arms are active, DO NOT render ANY separate Arm groups/components
        if (hasMergedArms && (n.includes('arml') || n.includes('armr'))) return null;
        // Conversely, if Separate Arms are active, skip merged Arms group/layers
        if (hasSeparateArms && n.startsWith('arms')) return null;

        const children = node.children || [];
        const layerChildren = children.filter(c => c.type === 'layer');
        const groupChildren = children.filter(c => c.type === 'group');

        // Selector group: only layers, no sub-groups OR flagged Variant
        if (node.isVariant || (layerChildren.length > 0 && groupChildren.length === 0)) {
            let selectedName = viewState[node._id];

            // Determine pool of selectable children
            // Variants select from their Subgroups (Style 01, Style 02)
            // Normal selectors select from Layers
            const pool = node.isVariant ? groupChildren : layerChildren;

            if (selectedName === null && !node.isVariant) return null; // explicit None (Variants enforce one active)

            if (!selectedName) {
                // If variant, default to first; if layer selector, default to visible or first
                if (node.isVariant) {
                    selectedName = pool[0]?.name;
                } else {
                    const visibleChild = pool.find(c => c.visible);
                    selectedName = visibleChild ? visibleChild.name : pool[0]?.name;
                }
            }

            const selectedNode = pool.find(c => c.name === selectedName) || pool[0];
            if (!selectedNode) return null;

            return (
                <pixiContainer alpha={alpha}>
                    <RenderNode
                        node={selectedNode}
                        viewState={viewState}
                        charName={charName}
                        hasSeparateArms={hasSeparateArms}
                        hasMergedArms={hasMergedArms}
                        activeMergedArmName={activeMergedArmName}
                        activeArmRName={activeArmRName}
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

            // Non-layer resets clip chain? 
            // NO! Groups (like Option_Arms) can be bases for clipping (e.g. Root Clipping Mask).
            // if (!isLayer) {
            //    clipBaseRef = null;
            // }

            return (
                <RenderNode
                    key={idx}
                    node={child}
                    viewState={viewState}
                    charName={charName}
                    maskRef={isClipping ? clipBaseRef : null}
                    // Allow Groups to setBaseRef too
                    setBaseRef={!isClipping ? captureBase : null}
                    hasSeparateArms={hasSeparateArms}
                    hasMergedArms={hasMergedArms}
                    activeMergedArmName={activeMergedArmName}
                    activeArmRName={activeArmRName}
                />
            );
        });

        const containerRef = useRef(null);
        // If we were passed a setBaseRef, call it with our container
        useEffect(() => {
            if (setBaseRef && containerRef.current) {
                setBaseRef(containerRef.current);
            }
        }, [setBaseRef]);

        return (
            <pixiContainer alpha={alpha} ref={containerRef}>
                {rendered}
            </pixiContainer>
        );
    }

    // Layer: always render unless blocked by logic
    if (node.type === 'layer') {
        const n = (node.name || '').toLowerCase();

        // Priority: If Merged Arms selected, hide ALL Separate Arm components
        if (hasMergedArms && (n.includes('arml') || n.includes('armr'))) return null;
        // If Separate Arms selected, hide merged Arms layers
        if (hasSeparateArms && n.startsWith('arms')) return null;
        // Option_Arm* 仅在分臂打开时显示；Effect_*Arm* 永远不显示
        if ((n.includes('option_arml') || n.includes('option_armr')) && !hasSeparateArms) return null;
        // Global block: User requested NO effects to be rendered at all
        if (n.includes('effect')) return null;
        // Hard block specific softlight/overlay glows that cause artifacts
        const hardBlock = (
            n.includes('blending01') ||
            n.includes('blending02') ||
            n.includes('rootblending') || // Sherry
            (n.includes('softlight') && (n.includes('arm') || n.includes('facial') || n.includes('root'))) ||
            (n.includes('overlay') && (n.includes('arm') || n.includes('root')))
        );
        if (hardBlock) return null;

        // Specific logic for AnAn's "Option_Arms" binding
        if (n.includes('option_arms')) {
            // Rule 1: If Separate Arms are active, hide merged options
            if (hasSeparateArms) return null;
            // Rule 2: If Merged Arms active, ensure option matches the active arm version
            if (activeMergedArmName) {
                // e.g. "Arms01" -> "01"
                const armNumber = activeMergedArmName.replace(/[^0-9]/g, '');
                // e.g. "Option_Arms02_06" -> "02"
                const optionMatch = n.match(/arms(\d+)/i);
                if (optionMatch) {
                    const optionNumber = optionMatch[1];
                    // If option number doesn't match arm number, hide it
                    if (optionNumber !== armNumber) {
                        // console.log('[ArmsDebug] Mismatch:', n, 'Target:', armNumber);
                        return null;
                    }
                    if (n.includes('06')) console.log('[ArmsDebug] MATCH:', n, 'Render ALLOWED', 'Z:', node.zIndex);
                }
            } else {
                // No merged arm selected? Hide options
                return null;
            }
        }

        // Specific logic for "Option_ArmR" binding (AnAn and others)
        if (n.includes('option_armr')) {
            // If Merged Arms active, these should probably be hidden? No, user didn't specify.
            // Assumption: If merged arms active, hide separate arm options.
            if (hasMergedArms) return null;

            if (activeArmRName) {
                // e.g. "ArmR01" -> "01"
                const armNumber = activeArmRName.replace(/[^0-9]/g, '');
                // e.g. "Option_ArmR02_Back" -> "02"
                const optionMatch = n.match(/armr(\d+)/i);
                if (optionMatch) {
                    const optionNumber = optionMatch[1];
                    if (optionNumber !== armNumber) return null;
                }
            } else {
                // No separate arm selected? Hide options
                return null;
            }
        }

        // Temporary mask fix: if clipping layer is Softlight (e.g., Facial01_Softlight) without a base, skip render to avoid glow
        const isSoftlightClip = node.clipping && node.blend_mode && node.blend_mode.toLowerCase() === 'soft_light';

        // REMOVED: The old check "if (isMergedArms && hasSeparateArms) return null;"
        // We now prioritize Merged Arms.

        const isMaskOnly = n.includes('clippingmask');
        if (isMaskOnly) return null;

        // Check if layer is explicitly hidden by viewState (e.g., "None" selected for a layer)
        const isHiddenByViewState = viewState[node._id] === null;
        if (isHiddenByViewState) return null;

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

        const isClippingLayer = !!node.clipping && !isSoftlightClip;

        useEffect(() => {
            if (setBaseRef && !isClippingLayer) setBaseRef(ref);
        }, [setBaseRef, isClippingLayer]);

        // If this is a clipping layer, attach it as mask to the baseRef
        useEffect(() => {
            if (isClippingLayer && maskRef?.current && ref.current) {
                maskRef.current.mask = ref.current;
            }
        }, [isClippingLayer, maskRef, texture]);

        if (!texture) return null;

        if (isClippingLayer) {
            return (
                <SpriteNode
                    ref={ref}
                    texture={texture}
                    x={x}
                    y={y}
                    alpha={alpha}
                    blendMode={blendMode}
                    mask={null}
                    visible={false}
                />
            );
        }

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

const CharacterViewer = ({ charName, model, viewState, lastAsset, background }) => {
    const [containerRef, parentSize] = useElementSize();
    const idMap = model?._idMap || {};
    // Check if ArmL or ArmR is explicitly selected
    const hasSeparateArms = useMemo(() => {
        const found = Object.entries(viewState).some(([k, v]) => {
            const node = idMap[k];
            if (!node) return false;
            const n = (node.name || '').toLowerCase();
            return v && (n.startsWith('arml') || n.startsWith('armr'));
        });
        console.log('[ArmsDebug] hasSeparateArms:', found, viewState);
        return found;
    }, [viewState, idMap]);

    // Capture the specific Merged Arm name (e.g. "Arms01", "Arms02")
    const activeMergedArmName = useMemo(() => {
        const found = Object.entries(viewState).find(([k, v]) => {
            const node = idMap[k];
            if (!node) return false;
            const n = (node.name || '').toLowerCase();
            return v && n.startsWith('arms') && !n.includes('arml') && !n.includes('armr');
        });
        // found is [id, selectedValueName]
        return found ? found[1] : null;
    }, [viewState, idMap]);
    // Capture unique Separate Arm names (e.g. "ArmR01", "ArmR02") for Option matching
    const activeArmRName = useMemo(() => {
        const found = Object.entries(viewState).find(([k, v]) => {
            const node = idMap[k];
            if (!node) return false;
            const n = (node.name || '').toLowerCase();
            // Startswith armr, not option, not merged arms
            return v && n.startsWith('armr') && !n.includes('option');
        });
        return found ? found[1] : null;
    }, [viewState, idMap]);
    const hasMergedArms = !!activeMergedArmName;

    // State for transform
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    // Initialize scale
    useEffect(() => {
        if (parentSize.width === 0 || parentSize.height === 0 || !model) return;

        // Debounce/Delay to ensure layout is stable (fixes 'initially huge' issue)
        const timer = setTimeout(() => {
            const canvas = model.canvas_size;
            const modelWidth = canvas?.width || 2000;
            const modelHeight = canvas?.height || 2000;

            // "Contain" fit: use the smaller of the two ratios
            const scaleX = (parentSize.width * 0.95) / modelWidth;
            const scaleY = (parentSize.height * 0.95) / modelHeight;
            const startScale = Math.min(scaleX, scaleY);

            // Center
            const startX = (parentSize.width - (modelWidth * startScale)) / 2;
            const startY = (parentSize.height - (modelHeight * startScale)) / 2;

            console.log('[CharacterViewer] Auto-Fit (Delayed):', {
                parent: parentSize,
                calc: { startScale, startX, startY }
            });

            setTransform({ x: startX, y: startY, scale: startScale });
        }, 50);

        return () => clearTimeout(timer);
    }, [model, parentSize.width, parentSize.height]);

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
                background: background === 'blue_sky'
                    ? 'linear-gradient(to bottom, #4facfe 0%, #00f2fe 100%)'
                    : background === 'warm'
                        ? 'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)'
                        : '#fafafa',
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
                <div style={{ marginTop: 8 }}>
                    <button
                        onClick={() => {
                            if (!model || !parentSize.width) return;
                            const canvas = model.canvas_size;
                            const w = canvas?.width || 2000;
                            const h = canvas?.height || 2000;
                            const sx = (parentSize.width * 0.95) / w;
                            const sy = (parentSize.height * 0.95) / h;
                            const s = Math.min(sx, sy);
                            setTransform({
                                x: (parentSize.width - w * s) / 2,
                                y: (parentSize.height - h * s) / 2,
                                scale: s
                            });
                        }}
                        style={{
                            pointerEvents: 'auto',
                            padding: '4px 8px',
                            background: '#333',
                            color: '#fff',
                            border: '1px solid #555',
                            cursor: 'pointer'
                        }}
                    >
                        Reset View
                    </button>
                </div>
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
                    backgroundAlpha={0} // Fully transparent to let CSS gradient show
                    // backgroundColor={0xff00ff} // REMOVED debug pink
                    preference="webgl" // force WebGL on browsers where WebGPU fails silently
                >
                    <pixiContainer
                        scale={transform.scale}
                        x={transform.x}
                        y={transform.y}
                    >
                        {/* debug rect removed */}
                        <RenderNode
                            node={model.root}
                            viewState={viewState}
                            charName={charName}
                            hasSeparateArms={hasSeparateArms}
                            hasMergedArms={hasMergedArms}
                            activeMergedArmName={activeMergedArmName}
                            activeArmRName={activeArmRName}
                        />
                    </pixiContainer>
                </Application>
            )}
        </div>
    );
};

export default CharacterViewer;
