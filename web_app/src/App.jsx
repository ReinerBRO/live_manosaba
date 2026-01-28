import React, { useState, useEffect } from 'react';
import { Layout, Menu, Select, Spin, message, Form, theme } from 'antd';
import CharacterViewer from './CharacterViewer';
import ControlPanel from './ControlPanel';
import './App.css';

const { Header, Sider, Content } = Layout;

function App() {
  const [characters, setCharacters] = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [background, setBackground] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [viewState, setViewState] = useState({}); // keys are unique group paths -> selected layer name
  const [lastAsset, setLastAsset] = useState(null); // debug: {label, url}
  const [loading, setLoading] = useState(false);
  const [isExportHovering, setIsExportHovering] = useState(false);

  const viewerRef = React.useRef(null);

  const makeKey = (pathArr) => pathArr.filter(Boolean).join('/');

  const makeSegment = (name, idx) => `${name || 'group'}#${idx}`;
  const findIdByPrefix = (prefix) => {
    if (!modelData?._idMap) return null;
    const entry = Object.entries(modelData._idMap).find(([, n]) =>
      (n.name || '').toLowerCase().startsWith(prefix.toLowerCase())
    );
    return entry ? Number(entry[0]) : null;
  };

  useEffect(() => {
    fetch('/resources/characters.json')
      .then(res => res.json())
      .then(data => {
        setCharacters(data.characters);
        if (data.characters.length > 0) {
          setSelectedChar(data.characters[0]);
        }
      })
      .catch(err => message.error("Failed to load character list"));
  }, []);

  useEffect(() => {
    if (!selectedChar) return;
    setLoading(true);
    fetch(`/resources/characters/${selectedChar}/PSD/model.json`)
      .then(res => res.json())
      .then(data => {
        // Helper to wrap loose layers of a specific prefix into a group
        const wrapLooseLayers = (node, prefix, groupName) => {
          if (!node.children || node.name === groupName) return;

          const targetLayers = node.children.filter(c =>
            c.type === 'layer' && (c.name || '').toLowerCase().startsWith(prefix.toLowerCase())
          );
          const hasTargetGroup = node.children.some(c =>
            c.type === 'group' && (c.name || '').toLowerCase().startsWith(prefix.toLowerCase())
          );

          if (targetLayers.length > 0 && !hasTargetGroup) {
            // Remove loose layers
            node.children = node.children.filter(c =>
              !(c.type === 'layer' && (c.name || '').toLowerCase().startsWith(prefix.toLowerCase()))
            );
            // Add new group containing them
            node.children.push({
              name: groupName,
              type: 'group',
              visible: true, // Default visible for Cheeks
              opacity: 255,
              blend_mode: 'PASS_THROUGH',
              children: targetLayers
            });
            // FIX: If this is an Option group, force it to the end of the list (Top Z-Order)
            // This ensures Option_Arms renders ON TOP of Arms/Body.
            if (groupName.includes('Option')) {
              const newGroup = node.children[node.children.length - 1];
              // It's already at the end because we just pushed it? 
              // Yes, BUT iterateChildren (recursion) might not have reached here yet.
              // Actually this is fine for the newly created group.
              // But wait, what if 'Arms' comes LATER in the list?
              // We need to ensure Arms are BEFORE Option.
              // Let's do a sort.
              node.children.sort((a, b) => {
                const na = (a.name || '').toLowerCase();
                const nb = (b.name || '').toLowerCase();
                const score = (name) => {
                  if (name.includes('body')) return 0;
                  if (name.includes('arms') && !name.includes('option')) return 10;
                  if (name.includes('option')) return 100; // Top
                  return 50;
                };
                return score(na) - score(nb);
              });
            }
          }
          node.children.forEach(c => wrapLooseLayers(c, prefix, groupName));
        };

        if (data.root) {
          // REMOVED wrapLooseLayers calls here because they interfere with Head Variant grouping.
          // We want Cheeks01/Pale01 etc. to be free so they can be moved into Style 01/02.

          // BUT, we MUST wrap 'Arms' because they are loose in Root (e.g. Alisa) and won't show in ControlPanel otherwise.
          wrapLooseLayers(data.root, 'Arms', 'Arms');



          // --- Restructure Head Variants (01 vs 02) ---
          const restructureHeadVariants = (node) => {
            if (!node || !node.children) return;

            // 1. Scan children to see if THIS node contains the variants
            // We look for components that DIRECTLY belong to 'Head 01' or 'Head 02'
            // logic: find at least one component matching style 01 AND one matching style 02
            let hasStyle01 = false;
            let hasStyle02 = false;

            const matchesStyle = (child, styleNum) => {
              const n = (child.name || '');
              const lower = n.toLowerCase();
              // Whitelist
              const headKeywords = ['headbase', 'cheeks', 'eyes', 'mouth', 'sweat', 'pale', 'mask_ref', 'facial', 'optionb_head'];
              const isHeadComponent = headKeywords.some(k => lower.startsWith(k));
              if (!isHeadComponent) return false;

              // IMPORTANT:
              // We must NOT treat any occurrence of "01" as style-01 because many names are like Sweat02_01
              // where "02" is the head style, and "_01" is just a variant index.
              const firstStyleToken = (s) => {
                const str = String(s || '');
                const idx01 = str.indexOf('01');
                const idx02 = str.indexOf('02');
                if (idx01 === -1 && idx02 === -1) return null;
                if (idx01 === -1) return '02';
                if (idx02 === -1) return '01';
                return idx01 < idx02 ? '01' : '02';
              };

              const selfToken = firstStyleToken(n);

              // Infer style from descendants by using the FIRST style token in each name (not any token).
              const inferChildTokens = (node) => {
                let has01 = false;
                let has02 = false;
                const walk = (nd) => {
                  const t = firstStyleToken(nd.name || '');
                  if (t === '01') has01 = true;
                  if (t === '02') has02 = true;
                  (nd.children || []).forEach(walk);
                };
                (node.children || []).forEach(walk);
                return { has01, has02 };
              };

              const { has01, has02 } = inferChildTokens(child);

              if (styleNum === '01') {
                // Mislabeled pure-02 group named like "*01" (Hiro mouth group)
                if (selfToken === '01' && has02 && !has01) return false;
                if (selfToken === '01') return true;
                if (selfToken === '02') return false;
                return has01 && !has02;
              }

              if (styleNum === '02') {
                // Mislabeled pure-01 group named like "*02" (rare)
                if (selfToken === '02' && has01 && !has02) return false;
                if (selfToken === '02') return true;
                if (selfToken === '01' && has02 && !has01) return true;
                if (selfToken === '01') return false;
                return has02 && !has01;
              }

              return false;
            };

            node.children.forEach(child => {
              if (matchesStyle(child, '01')) hasStyle01 = true;
              if (matchesStyle(child, '02')) hasStyle02 = true;
            });

            // If we found both styles in this node's children, we RESTRUCTURE THIS NODE (Split it)
            // But strict check: Only split if it involves "Core" head parts (HeadBase or OptionB_Head).
            // This prevents splitting "Mouth" groups just because they have Mouth01/Mouth02 (Alisa case).
            const hasCoreHeadPart = node.children.some(child => {
              const n = (child.name || '').toLowerCase();
              return n.includes('headbase') || n.includes('optionb_head');
            });

            if (hasStyle01 && hasStyle02 && hasCoreHeadPart) {
              console.log('Restructuring Head Variants in:', node.name || 'Root');
              const headGroup = {
                name: "Head",
                type: "group",
                isVariant: true,
                visible: true,
                opacity: 255,
                blend_mode: "PASS_THROUGH",
                children: []
              };
              const style01 = { name: "Head 01", type: "group", visible: true, opacity: 255, blend_mode: "PASS_THROUGH", children: [] };
              const style02 = { name: "Head 02", type: "group", visible: true, opacity: 255, blend_mode: "PASS_THROUGH", children: [] };

              const remaining = [];
              node.children.forEach(child => {
                if (matchesStyle(child, '02')) {
                  // Fix naming collision: If it belongs to Style 02 but is named "01", rename it to "02".
                  // This solves the Hiro case where two groups are named "Mouth01" (one for 01, one for 02).
                  if ((child.name || '').indexOf('01') !== -1) {
                    child.name = child.name.replace('01', '02');
                  }
                  style02.children.push(child);
                }
                else if (matchesStyle(child, '01')) {
                  style01.children.push(child);
                }
                else remaining.push(child);
              });

              // Post-process styles (Grouping loose layers, sorting)
              const groupKeywords = ['Cheeks', 'HeadBase', 'FacialLine', 'Sweat', 'Pale', 'OptionB_Head'];
              [style01, style02].forEach(styleGroup => {
                groupKeywords.forEach(k => wrapLooseLayers(styleGroup, k, k));
                // Sort Z-Order
                styleGroup.children.sort((a, b) => {
                  const nA = (a.name || '').toLowerCase();
                  const nB = (b.name || '').toLowerCase();
                  const score = (n) => {
                    if (n.includes('headbase')) return 0;
                    if (n.includes('pale')) return 1;
                    if (n.includes('facialline')) return 999;
                    return 500;
                  };
                  return score(nA) - score(nB);
                });
              });

              // Split mixed Mouth01 group that contains Mouth02_* layers (Hiro PSD quirk)
              // Move those Mouth02 layers into a new Mouth02 group under Head 02.
              const mouth01Group = style01.children.find(
                g => (g.name || '').toLowerCase() === 'mouth01' && Array.isArray(g.children)
              );
              const hasMouth02GroupStyle2 = style02.children.some(
                g => (g.name || '').toLowerCase() === 'mouth02'
              );
              if (mouth01Group && !hasMouth02GroupStyle2) {
                const mouth02Layers = mouth01Group.children.filter(
                  c => c.type === 'layer' && (c.name || '').toLowerCase().startsWith('mouth02')
                );
                if (mouth02Layers.length > 0) {
                  // Remove from Mouth01
                  mouth01Group.children = mouth01Group.children.filter(c => !mouth02Layers.includes(c));
                  // Create Mouth02 group under style02
                  style02.children.push({
                    name: 'Mouth02',
                    type: 'group',
                    visible: true,
                    opacity: 255,
                    blend_mode: 'PASS_THROUGH',
                    children: mouth02Layers
                  });
                }
              }

              // Move any pure-style head detail groups (Eyes/Sweat/Pale/Mask_Ref/FacialLine/Cheeks) that stayed in 'remaining'
              // because their parent name lacked 01/02. This avoids Eyes02 showing up under Head01.
              const headDetailKeywords = ['eyes', 'sweat', 'pale', 'mask_ref', 'facialline', 'cheeks'];
              const movePureStyleGroups = (styleNum, targetGroup) => {
                for (let i = remaining.length - 1; i >= 0; i--) {
                  const g = remaining[i];
                  if (!(g && g.type === 'group' && g.children)) continue;
                  const n = (g.name || '').toLowerCase();
                  if (!headDetailKeywords.some(k => n.includes(k))) continue;
                  const checkChildrenPure = (node) => {
                    const firstStyleToken = (s) => {
                      const str = String(s || '');
                      const idx01 = str.indexOf('01');
                      const idx02 = str.indexOf('02');
                      if (idx01 === -1 && idx02 === -1) return null;
                      if (idx01 === -1) return '02';
                      if (idx02 === -1) return '01';
                      return idx01 < idx02 ? '01' : '02';
                    };
                    let has01 = false, has02 = false;
                    const walk = (nd) => {
                      const t = firstStyleToken(nd.name || '');
                      if (t === '01') has01 = true;
                      if (t === '02') has02 = true;
                      (nd.children || []).forEach(walk);
                    };
                    walk(node);
                    return styleNum === '01' ? (has01 && !has02) : (has02 && !has01);
                  };
                  if (checkChildrenPure(g)) {
                    remaining.splice(i, 1);
                    targetGroup.children.push(g);
                  }
                }
              };
              movePureStyleGroups('01', style01);
              movePureStyleGroups('02', style02);

              // If Style 02 does not actually have controllable face parts (Eyes/Mouth),
              // the "Head 02" toggle becomes misleading (e.g. Hanna has only HeadBase02).
              // In that case, we collapse the variant and keep Style 01 only.
              const hasSelectorGroup = (rootNode, prefixLower) => {
                const stack = [rootNode];
                while (stack.length) {
                  const cur = stack.pop();
                  if (!cur || cur.type !== 'group' || !Array.isArray(cur.children)) continue;
                  const name = (cur.name || '').toLowerCase();
                  const hasLayer = cur.children.some(c => c.type === 'layer');
                  const hasGroup = cur.children.some(c => c.type === 'group');
                  if (name.startsWith(prefixLower) && hasLayer && !hasGroup) return true;
                  cur.children.forEach(c => stack.push(c));
                }
                return false;
              };
              const style01HasEyes = hasSelectorGroup(style01, 'eyes');
              const style01HasMouth = hasSelectorGroup(style01, 'mouth');
              const style02HasEyes = hasSelectorGroup(style02, 'eyes');
              const style02HasMouth = hasSelectorGroup(style02, 'mouth');
              const style02Incomplete = (style01HasEyes || style01HasMouth) && (!style02HasEyes && !style02HasMouth);

              if (style02Incomplete) {
                // Insert Style 01 head parts back into this node (keep ordering near body if possible),
                // and drop Style 02 entirely to "fix head 01".
                const bodyIdx = remaining.findIndex(c => (c.name || '').toLowerCase().includes('body'));
                if (bodyIdx !== -1) {
                  remaining.splice(bodyIdx + 1, 0, ...style01.children);
                  node.children = remaining;
                } else {
                  node.children = [...style01.children, ...remaining];
                }
                return;
              }

              headGroup.children.push(style01, style02);

              // Replace children: Remaining + New Head Group
              // Try to keep Head Group relatively high in the list (e.g. index 0 or 1)
              // If this is Root, typically Body is 0.
              // If this is Mask_Ref1, Body might be 0.
              // Let's look for Body index
              const bodyIdx = remaining.findIndex(c => (c.name || '').toLowerCase().includes('body'));
              if (bodyIdx !== -1) {
                remaining.splice(bodyIdx + 1, 0, headGroup);
                node.children = remaining;
              } else {
                node.children = [headGroup, ...remaining];
              }
            } else {
              // Not found here, recurse into children groups
              node.children.forEach(child => {
                if (child.type === 'group' || child.children) {
                  restructureHeadVariants(child);
                }
              });
            }
          };

          restructureHeadVariants(data.root);

          // POST-Restructure cleanup:
          // For characters like Alisa who might NOT have dual Head Styles (so restructure skipped),
          // we still need to wrap loose layers like Pale, Cheeks, Sweat so they show up in ControlPanel.
          // If restructure DID run (Ema), these won't find anything in root because they were moved.
          if (data.root) {
            wrapLooseLayers(data.root, 'Pale', 'Pale');
            wrapLooseLayers(data.root, 'Cheeks', 'Cheeks');
            wrapLooseLayers(data.root, 'Sweat', 'Sweat');
            wrapLooseLayers(data.root, 'FacialLine', 'FacialLine');
            wrapLooseLayers(data.root, 'Option', 'Option');
            wrapLooseLayers(data.root, 'Mask', 'Mask'); // Expose Mask01 for Alisa
          }
        }

        // Assign stable numeric ids to every node
        let idCounter = 0;
        const idMap = {};
        const assignIds = (node) => {
          node._id = idCounter++;
          idMap[node._id] = node;
          (node.children || []).forEach(assignIds);
        };
        if (data.root) assignIds(data.root);
        data._idMap = idMap;
        setModelData(data);

        // Initialize default view state
        const initialViewState = {};

        const traverse = (node) => {
          if (!node.children) return;

          // Check if it's a "Selector Group" (has layer children)
          const layerChildren = node.children.filter(c => c.type === 'layer');
          const hasGroupChild = node.children.some(c => c.type === 'group');
          if (layerChildren.length > 0 && !hasGroupChild) {
            // Leaf selector group: choose visible or first
            const isPaleGroup = (node.name || '').toLowerCase().startsWith('pale');
            if (isPaleGroup) {
              initialViewState[node._id] = null; // default to None for Pale
            } else {
              const visibleChild = layerChildren.find(c => c.visible);
              const chosen = (visibleChild || layerChildren[0]).name;
              initialViewState[node._id] = chosen;
            }
          }

          // Recurse for subgroups
          node.children.forEach(child => traverse(child));
        };

        if (data.root) traverse(data.root);

        // If ArmL 或 ArmR 选中了非空层，则强制把合并手臂(Arms*)设为 None，避免多臂
        const findGroupId = (namePrefix) => {
          const entry = Object.entries(idMap).find(([, n]) => (n.name || '').toLowerCase().startsWith(namePrefix));
          return entry ? Number(entry[0]) : null;
        };

        const armLId = findGroupId('arml');
        const armRId = findGroupId('armr');
        const armsId = findGroupId('arms');

        const armLSelected = armLId !== null ? initialViewState[armLId] : null;
        const armRSelected = armRId !== null ? initialViewState[armRId] : null;
        if (armsId !== null && (armLSelected || armRSelected)) {
          initialViewState[armsId] = null; // None
        }
        // 反向：如果 Arms 选中，且 ArmL/ArmR 是空，则保持；若 ArmL/ArmR 有值，保持 None
        // 已在上面处理

        setViewState(initialViewState);
        setLoading(false);
      })
      .catch(err => {
        message.error("Failed to load model data");
        setLoading(false);
      });
  }, [selectedChar]);

  const handleStateChange = (groupKey, layerName) => {
    console.log('[Control] change', groupKey, '->', layerName);
    setViewState(prev => {
      const next = { ...prev, [groupKey]: layerName };
      // Mutual exclusion between Arms and ArmL/ArmR based on last action
      if (modelData?._idMap) {
        const node = modelData._idMap[groupKey];
        const name = (node?.name || '').toLowerCase();
        const isArms = name.startsWith('arms');
        const isArmL = name.startsWith('arml');
        const isArmR = name.startsWith('armr');

        const findGroupIdByName = (targetName) => {
          const entry = Object.entries(modelData._idMap).find(([, n]) => (n.name || '').toLowerCase() === targetName);
          return entry ? Number(entry[0]) : null;
        };

        const armsId = findGroupIdByName('arms');
        const armLId = findGroupIdByName('arml');
        const armRId = findGroupIdByName('armr');

        if (isArms) {
          if (armLId !== null) next[armLId] = null;
          if (armRId !== null) next[armRId] = null;
          // auto select matching Option_Arms variant
          const optId = findIdByPrefix('option_arms');
          if (optId !== null) {
            const optNode = modelData._idMap[optId];
            const layers = (optNode.children || []).filter(c => c.type === 'layer');
            // choose first matching prefix (Option_Arms01_*, Option_Arms02_*)
            const targetPrefix = layerName && layerName.includes('01') ? 'option_arms01' : 'option_arms02';
            const match = layers.find(l => (l.name || '').toLowerCase().startsWith(targetPrefix));
            next[optId] = match ? match.name : null;
          }
        }
        if (isArmL || isArmR) {
          if (armsId !== null) next[armsId] = null;
          // selecting split arms clears option arms
          const optId = findIdByPrefix('option_arms');
          if (optId !== null) next[optId] = null;
        }
      }
      return next;
    });

    // Find asset path for debug display
    if (modelData && layerName) {
      const findLayer = (node) => {
        if (node.type === 'layer' && node.name === layerName) return node;
        for (const c of node.children || []) {
          const res = findLayer(c);
          if (res) return res;
        }
        return null;
      };
      const layerNode = findLayer(modelData.root);
      if (layerNode && layerNode.image) {
        const fullPath = `/resources/characters/${selectedChar}/PSD/${layerNode.image}`;
        setLastAsset({ label: layerName, url: fullPath });
      } else {
        setLastAsset({ label: `${layerName} (asset not found)`, url: null });
      }
    }
  };

  const randomizeExpression = (targetChar) => {
    if (!(targetChar === 'Ema' || targetChar === 'Hiro' || targetChar === 'Sherry' || targetChar === 'Hanna')) return;
    if (!modelData?.root || !modelData?._idMap) return;

    const idMap = modelData._idMap;

    const isSelectorGroup = (node) => {
      if (!node || node.type !== 'group' || !Array.isArray(node.children) || node.children.length === 0) return false;
      const hasLayer = node.children.some(c => c.type === 'layer');
      const hasGroup = node.children.some(c => c.type === 'group');
      return hasLayer && !hasGroup;
    };

    const getLayerChildren = (node) => (node?.children || []).filter(c => c.type === 'layer');
    const pickOne = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

    const findNodeByNameExact = (exactNameLower) => {
      const entry = Object.entries(idMap).find(([, n]) => (n.name || '').toLowerCase() === exactNameLower);
      return entry ? idMap[Number(entry[0])] : null;
    };

    const findGroupIdByPrefix = (prefixLower) => {
      const entry = Object.entries(idMap).find(([, n]) => (n.name || '').toLowerCase().startsWith(prefixLower));
      return entry ? Number(entry[0]) : null;
    };

    const findHeadVariant = () => {
      // Prefer the injected variant group (name: "Head", isVariant: true)
      const entry = Object.entries(idMap).find(([, n]) => n?.isVariant && (n.name || '').toLowerCase() === 'head');
      if (entry) return idMap[Number(entry[0])];
      // Fallback: any variant group
      const any = Object.entries(idMap).find(([, n]) => n?.isVariant);
      return any ? idMap[Number(any[0])] : null;
    };

    setViewState(() => {
      const next = {};

      const firstStyleToken = (s) => {
        const str = String(s || '');
        const idx01 = str.indexOf('01');
        const idx02 = str.indexOf('02');
        if (idx01 === -1 && idx02 === -1) return null;
        if (idx01 === -1) return '02';
        if (idx02 === -1) return '01';
        return idx01 < idx02 ? '01' : '02';
      };

      // 1) Randomize Head 01/02 (variant group)
      const headVariant = findHeadVariant();
      let headStyleToken = null; // '01' or '02'
      if (headVariant && Array.isArray(headVariant.children) && headVariant.children.length > 0) {
        const styles = headVariant.children.filter(c => c.type === 'group');
        const picked = pickOne(styles);
        if (picked) next[headVariant._id] = picked.name;
        headStyleToken = firstStyleToken(picked?.name || '');
      }

      // 2) Randomize all selector groups (but keep some special handling)
      Object.values(idMap).forEach((node) => {
        if (!isSelectorGroup(node)) return;
        const groupName = (node.name || '').toLowerCase();

        // Don't randomize option groups directly; they depend on arms mode.
        if (groupName.includes('option')) return;
        // Effects are always hidden; no need to randomize.
        if (groupName.includes('effect')) return;

        const layers = getLayerChildren(node);
        if (layers.length === 0) return;

        // FacialLine is always-on and should match the chosen head style.
        if (groupName.includes('facialline')) {
          const wanted = headStyleToken || '01';
          const candidates = layers.filter(l => firstStyleToken(l.name || '') === wanted);
          next[node._id] = (pickOne(candidates) || pickOne(layers))?.name ?? null;
          return;
        }

        // HeadBase is always-on; match the chosen head style to avoid "head disappears".
        if (groupName.includes('headbase')) {
          const wanted = headStyleToken || '01';
          const candidates = layers.filter(l => firstStyleToken(l.name || '') === wanted);
          next[node._id] = (pickOne(candidates) || pickOne(layers))?.name ?? null;
          return;
        }

        const isMouth = groupName.includes('mouth');
        const isEyes = groupName.includes('eyes');
        const isArm = groupName === 'arml' || groupName === 'armr' || groupName.startsWith('arms');
        const isPale = groupName.startsWith('pale');

        // No-None constraint for Mouth/Eyes/Arm
        if (isMouth || isEyes || isArm) {
          next[node._id] = pickOne(layers)?.name ?? null;
          return;
        }

        // Pale defaults to None most of the time
        if (isPale) {
          next[node._id] = Math.random() < 0.8 ? null : (pickOne(layers)?.name ?? null);
          return;
        }

        // Other groups: allow None occasionally
        next[node._id] = Math.random() < 0.1 ? null : (pickOne(layers)?.name ?? null);
      });

      // 3) Arms mutual exclusion + option binding (merged vs separate)
      const armsId = findGroupIdByPrefix('arms');
      const armLId = findGroupIdByPrefix('arml');
      const armRId = findGroupIdByPrefix('armr');

      const armsNode = armsId !== null ? idMap[armsId] : null;
      const armLNode = armLId !== null ? idMap[armLId] : null;
      const armRNode = armRId !== null ? idMap[armRId] : null;

      const armsLayers = getLayerChildren(armsNode);
      const armLLayers = getLayerChildren(armLNode);
      const armRLayers = getLayerChildren(armRNode);

      const canMerged = armsLayers.length > 0;
      const canSeparate = armLLayers.length > 0 || armRLayers.length > 0;
      const mode = (canMerged && canSeparate) ? (Math.random() < 0.5 ? 'merged' : 'separate') : (canMerged ? 'merged' : 'separate');

      const optArmsId = findGroupIdByPrefix('option_arms');
      const optArmLId = findGroupIdByPrefix('option_arml');
      const optArmRId = findGroupIdByPrefix('option_armr');

      if (mode === 'merged') {
        if (armsId !== null) next[armsId] = pickOne(armsLayers)?.name ?? null;
        if (armLId !== null) next[armLId] = null;
        if (armRId !== null) next[armRId] = null;

        // Option_Arms should match Arms01/02 when present
        if (optArmsId !== null && armsId !== null && next[armsId]) {
          const optNode = idMap[optArmsId];
          const optLayers = getLayerChildren(optNode);
          const armNum = String(next[armsId]).replace(/[^0-9]/g, '');
          const prefix = armNum ? `option_arms${armNum}` : 'option_arms';
          const candidates = optLayers.filter(l => (l.name || '').toLowerCase().startsWith(prefix));
          next[optArmsId] = (pickOne(candidates) || pickOne(optLayers))?.name ?? null;
        }
        if (optArmLId !== null) next[optArmLId] = null;
        if (optArmRId !== null) next[optArmRId] = null;
      } else {
        // separate
        if (armsId !== null) next[armsId] = null;
        if (armLId !== null) next[armLId] = pickOne(armLLayers)?.name ?? null;
        if (armRId !== null) next[armRId] = pickOne(armRLayers)?.name ?? null;

        if (optArmsId !== null) next[optArmsId] = null;

        // Option_ArmL/ArmR match selected numbers when present
        if (optArmLId !== null && armLId !== null && next[armLId]) {
          const optNode = idMap[optArmLId];
          const optLayers = getLayerChildren(optNode);
          const armNum = String(next[armLId]).replace(/[^0-9]/g, '');
          const prefix = armNum ? `option_arml${armNum}` : 'option_arml';
          const candidates = optLayers.filter(l => (l.name || '').toLowerCase().startsWith(prefix));
          next[optArmLId] = (pickOne(candidates) || pickOne(optLayers))?.name ?? null;
        } else if (optArmLId !== null) {
          next[optArmLId] = null;
        }

        if (optArmRId !== null && armRId !== null && next[armRId]) {
          const optNode = idMap[optArmRId];
          const optLayers = getLayerChildren(optNode);
          const armNum = String(next[armRId]).replace(/[^0-9]/g, '');
          const prefix = armNum ? `option_armr${armNum}` : 'option_armr';
          const candidates = optLayers.filter(l => (l.name || '').toLowerCase().startsWith(prefix));
          next[optArmRId] = (pickOne(candidates) || pickOne(optLayers))?.name ?? null;
        } else if (optArmRId !== null) {
          next[optArmRId] = null;
        }
      }

      // 4) Final safety: enforce no-None for mouth/eyes within current model
      Object.values(idMap).forEach((node) => {
        if (!isSelectorGroup(node)) return;
        const groupName = (node.name || '').toLowerCase();
        if (!(groupName.includes('mouth') || groupName.includes('eyes'))) return;
        if (next[node._id] === null || next[node._id] === undefined) {
          const layers = getLayerChildren(node);
          next[node._id] = pickOne(layers)?.name ?? null;
        }
      });

      return next;
    });
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={300} theme="light" style={{ borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
        <div style={{ padding: '20px' }}>
          <h2 style={{ color: '#ff4d4f', marginBottom: 20 }}>ManoSaba Generator</h2>
          <Form layout="vertical">
            <Form.Item label="Character:">
              <Select
                value={selectedChar}
                onChange={val => {
                  setSelectedChar(val);
                  setViewState({}); // Reset view state on char change
                }}
                options={characters.map(c => ({ label: c, value: c }))}
              />
            </Form.Item>
          </Form>

          {modelData ? (
            <ControlPanel
              model={modelData}
              viewState={viewState}
              onChange={handleStateChange}
              background={background}
              setBackground={setBackground}
              charName={selectedChar}
              onRandomizeExpression={() => randomizeExpression(selectedChar)}
              onExportHover={() => setIsExportHovering(true)}
              onExportLeave={() => setIsExportHovering(false)}
              onExportClick={() => {
                if (viewerRef.current && viewerRef.current.exportImage) {
                  viewerRef.current.exportImage();
                }
              }}
            />
          ) : (
            <div>Loading controls...</div>
          )}
        </div>
      </Sider>

      <Content style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            Loading Character...
          </div>
        ) : modelData ? (
          <div style={{ width: '100%', height: '100%' }}>
            <CharacterViewer
              ref={viewerRef}
              charName={selectedChar}
              model={modelData}
              viewState={viewState}
              lastAsset={lastAsset}
              background={background}
              isExportHovering={isExportHovering}
            />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            Select a character
          </div>
        )}
      </Content>
    </Layout>
  );
}

export default App;
