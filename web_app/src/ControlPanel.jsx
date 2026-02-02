import React from 'react';
import { Radio, Collapse, Button } from 'antd';
import { CaretRightOutlined, DownloadOutlined } from '@ant-design/icons';

const { Panel } = Collapse;



function ControlPanel({ model, viewState, onChange, background, setBackground, onExportHover, onExportLeave, onExportClick, charName, onRandomizeExpression }) {

    // Decide if a node is a "Structure Group" (has subgroup) vs "Selector" (only layers)
    const isStructureGroup = (node) => {
        return node.children && node.children.some(c => c.type === 'group');
    };

    const renderNode = (node) => {
        if (!node.children || node.children.length === 0) return null;

        // Helper: Find active merged arm name (e.g. "Arms01")
        const activeMergedArmName = Object.entries(viewState).map(([k, v]) => {
            // We don't have direct access to idMap here easily unless passed, 
            // but we can iterate active viewState values.
            // Actually, we need to know if the ID corresponds to an 'Arms' group.
            // Since we don't have the full map, we might need to rely on the value string itself if unique enough?
            // BETTER: traverse model once to build ID map or just search model.root?
            // For now, let's rely on the fact that the value string (e.g. "Arms01") is unique enough.
            return v;
        }).find(v => v && v.toLowerCase().startsWith('arms') && !v.toLowerCase().includes('arml') && !v.toLowerCase().includes('armr'));

        const activeArmRName = Object.entries(viewState).map(([k, v]) => v).find(v => v && v.toLowerCase().startsWith('armr') && !v.toLowerCase().includes('option'));

        // Filtering: hide nodes named "Shadow" or "Effect" or "HeadBase" or "FacialLine" (case-insensitive)
        const name = (node.name || '').toLowerCase();
        if (name.includes('shadow') || name.includes('effect') || name.includes('headbase') || name.includes('facialline')) return null;

        // 1. Variant Group (e.g. Head -> Style 01, Style 02)
        // Renders a selector for the children (styles), AND recursively renders the SELECTED child's content.
        if (node.isVariant) {
            const selectedName = viewState[node._id];
            // Find the active child based on selection or default to first
            let activeChild = node.children.find(c => c.name === selectedName);
            if (!activeChild && !selectedName) {
                activeChild = node.children[0];
            }

            return (
                <div style={{ marginBottom: 15, paddingLeft: 10 }}>
                    <div style={{ marginBottom: 5 }}>
                        <h4 style={{ margin: '5px 0', fontSize: '13px', color: '#666' }}>{node.name}</h4>
                        <Radio.Group
                            value={viewState[node._id] ?? (node.children[0]?.name)}
                            onChange={e => onChange(node._id, e.target.value)}
                            size="small"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}
                        >
                            {node.children.map(child => (
                                <Radio.Button key={child._id} value={child.name} style={{ fontSize: '12px' }}>
                                    {child.name}
                                </Radio.Button>
                            ))}
                        </Radio.Group>
                    </div>
                    {/* Recursive Render of Selected Child's Controls */}
                    {activeChild && (
                        <div style={{ paddingLeft: 10, borderLeft: '2px solid #eee', marginTop: 10 }}>
                            {activeChild.children && activeChild.children.map((grandChild, idx) => (
                                <div key={`${grandChild._id || idx}`}>
                                    {renderNode(grandChild)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        // 2. Selector Group: Only layers (no subgroups)
        // Renders a simple radio selector.
        const layerChildren = node.children.filter(c => c.type === 'layer');
        const hasSubGroups = node.children.some(c => c.type === 'group');

        if (layerChildren.length > 0 && !hasSubGroups) {
            const key = node._id;
            return (
                <div style={{ marginBottom: 15, paddingLeft: 10 }}>
                    <h4 style={{ margin: '5px 0', fontSize: '13px', color: '#666' }}>{node.name}</h4>
                    <Radio.Group
                        value={viewState[key] ?? ""}
                        onChange={e => onChange(key, e.target.value === "" ? null : e.target.value)}
                        size="small"
                        style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}
                    >
                        <Radio.Button value="" style={{ fontSize: '12px' }}>None</Radio.Button>
                        {layerChildren.filter(child => {
                            const n = child.name.toLowerCase();
                            if (node.name.toLowerCase().includes('option')) {
                                // Filter Option_Arms
                                if (n.includes('option_arms')) {
                                    if (!activeMergedArmName) return false;
                                    const armNumber = activeMergedArmName.replace(/[^0-9]/g, ''); // "Arms01" -> "01"
                                    const optionMatch = n.match(/arms(\d+)/i);
                                    if (optionMatch && optionMatch[1] !== armNumber) return false;
                                }
                                // Filter Option_ArmR
                                if (n.includes('option_armr')) {
                                    if (!activeArmRName) return false;
                                    const armNumber = activeArmRName.replace(/[^0-9]/g, '');
                                    const optionMatch = n.match(/armr(\d+)/i);
                                    if (optionMatch && optionMatch[1] !== armNumber) return false;
                                }
                            }
                            return true;
                        }).map(child => (
                            <Radio.Button key={child._id} value={child.name} style={{ fontSize: '12px' }}>
                                {child.name}
                            </Radio.Button>
                        ))}
                    </Radio.Group>
                </div>
            );
        }

        // 3. Structure Group: Has subgroups (Collapse)
        // Renders a foldable section.
        if (isStructureGroup(node)) {
            const items = [{
                key: '0',
                label: node.name,
                children: (
                    <>
                        {node.children.map((child, idx) => (
                            <div key={`${child._id || idx}`}>
                                {renderNode(child)}
                            </div>
                        ))}
                    </>
                )
            }];

            return (
                <Collapse
                    key={node._id}
                    defaultActiveKey={['0']}
                    ghost
                    expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
                    size="small"
                    items={items}
                />
            );
        }

        return null;
    };

    if (model.root) {
        return (
            <div style={{ padding: '0 10px', overflowY: 'auto', height: '100%' }}>
                <h3>Controls</h3>

                {/* Randomizer (currently enabled for Ema/Hiro/Sherry/Hanna/AnAn/Nanoka) */}
                {(charName === 'Ema' || charName === 'Hiro' || charName === 'Sherry' || charName === 'Hanna' || charName === 'AnAn' || charName === 'Nanoka') && typeof onRandomizeExpression === 'function' && (
                    <div style={{ marginBottom: 12 }}>
                        <Button type="primary" onClick={onRandomizeExpression} style={{ width: '100%' }}>
                            随机表情 / Random Expression ({charName})
                        </Button>
                    </div>
                )}

                {/* Background Selector */}
                {setBackground && (
                    <div style={{ marginBottom: 15 }}>
                        <Collapse defaultActiveKey={['bg']} ghost size="small">
                            <Panel header="Background / 背景" key="bg">
                                <Radio.Group
                                    value={background}
                                    onChange={e => setBackground(e.target.value)}
                                    buttonStyle="solid"
                                    size="small"
                                >
                                    <Radio.Button value={null}>None</Radio.Button>
                                    <Radio.Button value="blue_sky" style={{ background: 'linear-gradient(to right, #4facfe, #00f2fe)', color: 'white', border: 'none' }}>Sky</Radio.Button>
                                    <Radio.Button value="warm" style={{ background: 'linear-gradient(to right, #f093fb, #f5576c)', color: 'white', border: 'none', marginLeft: 5 }}>Warm</Radio.Button>
                                </Radio.Group>
                            </Panel>
                        </Collapse>
                    </div>
                )}

                {model.root.children.map((child, idx) => (
                    <div key={`${child._id || idx}`}>
                        {renderNode(child)}
                    </div>
                ))}

                {/* Export Button */}
                <div style={{ marginTop: 30, marginBottom: 20, textAlign: 'center' }}>
                    <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        size="large"
                        onMouseEnter={onExportHover}
                        onMouseLeave={onExportLeave}
                        onClick={onExportClick}
                        style={{ width: '100%' }}
                    >
                        导出图片 / Export
                    </Button>
                </div>
            </div>
        );
    }

    return <div>No Data</div>;
}

export default ControlPanel;
