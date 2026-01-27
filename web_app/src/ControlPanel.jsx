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

        // Selector group: only layers
        const layerChildren = node.children.filter(c => c.type === 'layer');
        if (layerChildren.length > 0) {
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
