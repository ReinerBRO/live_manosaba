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
  const makeKey = (pathArr) => pathArr.filter(Boolean).join('/');
  const makeSegment = (name, idx) => `${name || 'group'}#${idx}`;

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
          const restructureHeadVariants = (root) => {
            const headGroup = {
              name: "Head",
              type: "group",
              isVariant: true, // Custom flag for mutual exclusion
              visible: true,
              opacity: 255,
              blend_mode: "PASS_THROUGH",
              children: []
            };

            const style01 = {
              name: "Head 01",
              type: "group",
              visible: true,
              opacity: 255,
              blend_mode: "PASS_THROUGH",
              children: []
            };

            const style02 = {
              name: "Head 02",
              type: "group",
              visible: true,
              opacity: 255,
              blend_mode: "PASS_THROUGH",
              children: []
            };

            // Helper to check if node belongs to a specific style (01 or 02)
            // Logic: Must be one of the Head components AND have the specific number as the *first* occurrence of 01/02
            const matchesStyle = (node, styleNum) => {
              const n = (node.name || '');
              const lower = n.toLowerCase();

              // 1. Whitelist check: Must be a head component
              const headKeywords = ['headbase', 'cheeks', 'eyes', 'mouth', 'sweat', 'pale', 'mask_ref', 'facial'];
              const isHeadComponent = headKeywords.some(k => lower.startsWith(k));

              if (!isHeadComponent) return false;

              // 2. Check suffix logic: "match with the first 01 or 02 after the word"
              // Simplification: Check if the *first* occurrence of "01" or "02" matches our target
              const idx01 = n.indexOf('01');
              const idx02 = n.indexOf('02');

              // If neither exists, logic is tricky. Assuming if it's a head component but no number, maybe it's neutral?
              // But user said "match... 01 or 02". If none, maybe keep in root?
              // For now, if strictly 01 or 02 is required:

              if (styleNum === '01') {
                if (idx01 !== -1 && (idx02 === -1 || idx01 < idx02)) return true;
              }
              if (styleNum === '02') {
                if (idx02 !== -1 && (idx01 === -1 || idx02 < idx01)) return true;
              }

              // Should we check children? 
              // If group (like Mask_Ref1), it might not have number in name but children do?
              // User said "Mask_Ref1 and Ref2", earlier I saw Mask_Ref1 twice.
              // If parent doesn't have explicit 01/02, maybe check children?
              // The previous "Mask_Ref1" duplicates were distinguished by children content.
              if (node.children && idx01 === -1 && idx02 === -1) {
                return node.children.some(c => matchesStyle(c, styleNum));
              }

              return false;
            };

            // Filter root children
            const remainingChildren = [];
            root.children.forEach(child => {
              const n = (child.name || '').toLowerCase();

              // Always keep Body, Shadow, Arms, Hair, etc. in root (unless they explicitly match Head logic? No, user said Arm is common)
              // So we only move things if they Pass the matchesStyle check.

              if (matchesStyle(child, '02')) {
                style02.children.push(child);
              } else if (matchesStyle(child, '01')) {
                style01.children.push(child);
              } else {
                remainingChildren.push(child);
              }
            });

            // If we found items, apply restructuring
            if (style01.children.length > 0 && style02.children.length > 0) {

              // CRITICAL: Group loose layers inside styles so ControlPanel renders them!
              // ControlPanel ignores loose layers inside Structure Groups (groups with subgroups).
              // Since Style01/02 contain subgroups (like Eyes, Mouth), loose layers (Cheeks, HeadBase) MUST be grouped.
              const groupKeywords = ['Cheeks', 'HeadBase', 'FacialLine', 'Sweat', 'Pale'];

              [style01, style02].forEach(styleGroup => {
                // 1. Group direct children (Cheeks, HeadBase, FacialLine)
                groupKeywords.forEach(keyword => {
                  wrapLooseLayers(styleGroup, keyword, keyword);
                });

                // 2. Deep clean: Check Mask_Ref for loose layers (Sweat)
                // Mask_Ref is a group, so we need to recurse or check its children.
                // Since wrapLooseLayers is recursive, we can just run it on the style group? 
                // Wait, wrapLooseLayers is defined above but assumes 'node' structure.
                // The wrapLooseLayers defined in line 38 is recursive.
                // Let's just make sure we call it for 'Sweat' and 'Pale' which might be deep.
                // Calling it on styleGroup should traverse down.

                // 2. CORRECTION: Fix Z-Order. 
                // HeadBase must be at the BOTTOM (first drawn).
                // Eyes, Mouth, Cheeks etc should be on TOP.
                // Simple sort: HeadBase -> Pale -> Others
                styleGroup.children.sort((a, b) => {
                  const nameA = (a.name || '').toLowerCase();
                  const nameB = (b.name || '').toLowerCase();

                  const getScore = (n) => {
                    if (n.includes('headbase')) return 0; // Bottom
                    if (n.includes('pale')) return 1;     // Above base
                    if (n.includes('facialline')) return 900; // Very top
                    return 500; // Middle (Eyes, Mouth, Cheeks, etc)
                  };

                  return getScore(nameA) - getScore(nameB);
                });
              });

              headGroup.children.push(style01, style02);

              // Place Head group after Body (usually first item) if possible
              // or just append to filtered list
              root.children = remainingChildren;
              // Insert Head group at appropriate index (e.g. 1, after Body)
              root.children.splice(1, 0, headGroup);
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
        }
        if (isArmL || isArmR) {
          if (armsId !== null) next[armsId] = null;
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
              charName={selectedChar}
              model={modelData}
              viewState={viewState}
              lastAsset={lastAsset}
              background={background}
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
