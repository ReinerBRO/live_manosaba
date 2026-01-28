import React from 'react';
import { Radio, Collapse } from 'antd';
import { CaretRightOutlined } from '@ant-design/icons';

function ControlPanel({ model, viewState, onChange }) {

    // Decide if a node is a "Structure Group" (has subgroup) vs "Selector" (only layers)
    const isStructureGroup = (node) => {
        return node.children && node.children.some(c => c.type === 'group');
    };

    const renderNode = (node) => {
        if (!node.children || node.children.length === 0) return null;

        // Filtering: hide nodes named "Shadow" or "Effect" or "HeadBase" (case-insensitive)
        const name = (node.name || '').toLowerCase();
        if (name.includes('shadow') || name.includes('effect') || name.includes('headbase')) return null;

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
                        {layerChildren.map(child => (
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
                {model.root.children.map((child, idx) => (
                    <div key={`${child._id || idx}`}>
                        {renderNode(child)}
                    </div>
                ))}
            </div>
        );
    }

    return <div>No Data</div>;
}

export default ControlPanel;
