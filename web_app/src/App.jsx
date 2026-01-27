import React, { useState, useEffect } from 'react';
import { Layout, Menu, Select, Spin, message, Form, theme } from 'antd';
import CharacterViewer from './CharacterViewer';
import ControlPanel from './ControlPanel';
import './App.css';

const { Header, Sider, Content } = Layout;

function App() {
  const [characters, setCharacters] = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [viewState, setViewState] = useState({}); // keys are unique group paths -> selected layer name
  const [lastAsset, setLastAsset] = useState(null); // debug: {label, url}
  const [loading, setLoading] = useState(false);
  const makeKey = (pathArr) => pathArr.filter(Boolean).join('/');
  const makeSegment = (name, idx) => `${name || 'group'}#${idx}`;

  useEffect(() => {
    fetch('/asset/characters.json')
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
    fetch(`/asset/characters/${selectedChar}/PSD/model.json`)
      .then(res => res.json())
      .then(data => {
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
            const visibleChild = layerChildren.find(c => c.visible);
            const chosen = (visibleChild || layerChildren[0]).name;
            initialViewState[node._id] = chosen;
          }

          // Recurse for subgroups
          node.children.forEach(child => traverse(child));
        };

        if (data.root) traverse(data.root);

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
    setViewState(prev => ({
      ...prev,
      [groupKey]: layerName
    }));

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
        const fullPath = `/asset/characters/${selectedChar}/PSD/${layerNode.image}`;
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
