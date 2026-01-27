import assemble
import argparse

class Node:
    """
    Transform's id as key of node in node_map
    """
    def __init__(self, game_object: dict, prefab_data: dict):
        self.id = None
        self.name = game_object['m_Name']
        self.children = []
        self.raw_sprite_renderer = None
        # self.raw_transform = None
        self._local_transform = None
        self._global_transform = None
        # self.mono_behaviour_id = None

        m_component = game_object['m_Component']
        for item in m_component:
            file_id = str(item['component']['fileID'])
            component = prefab_data[file_id]
            if 'Transform' in component:
                self.id = file_id
                # self.raw_transform = component
                m_children = component['Transform']['m_Children']
                for item in m_children:
                    file_id = str(item['fileID'])
                    self.children.append(file_id)
                self.father = str(component['Transform']['m_Father']['fileID'])
                self._local_transform = component['Transform']['m_LocalPosition']
            elif 'SpriteRenderer' in component:
                self.raw_sprite_renderer = component
            # elif 'MonoBehaviour' in component:
            #     self.mono_behaviour_id = file_id

        assert self.id is not None, f"Transform id not found for GameObject: {self.name}"

    def has_sprite(self):
        return self.raw_sprite_renderer is not None
    
    def render_enabled(self):
        if self.raw_sprite_renderer is None:
            return False
        return self.raw_sprite_renderer['SpriteRenderer']['m_Enabled'] == 1
    
    def get_material_guid(self):
        if self.raw_sprite_renderer is None:
            return None
        materials = self.raw_sprite_renderer['SpriteRenderer']['m_Materials']
        assert len(materials) == 1, f"Multiple or none materials found for SpriteRenderer in node {self.name} (id: {self.id})"
        guid = materials[0]['guid']
        return guid
    
    def get_father_node(self, node_map: dict) -> 'Node|None':
        if self.father == '0':
            return None
        return node_map[self.father]
    
    def get_global_transform(self, node_map: dict):
        """递归计算全局位置并缓存"""
        if self._global_transform is not None:
            return self._global_transform
        if self._local_transform is None:
            return None
        
        # position = self.raw_transform['Transform']['m_LocalPosition']
        position = self._local_transform.copy()

        father_node = self.get_father_node(node_map)
        if father_node is None:
            self._global_transform = position
            return self._global_transform
        
        father_position = father_node.get_global_transform(node_map)
        position['x'] += father_position['x']
        position['y'] += father_position['y']
        position['z'] += father_position['z']

        self._global_transform = position
        return self._global_transform

    def get_sprite_size(self) -> dict|None:
        if self.raw_sprite_renderer is None:
            return None
        m_size = self.raw_sprite_renderer['SpriteRenderer']['m_Size']
        return m_size

def build_tree(prefab_data: dict):
    node_map = {}
    root = None

    for _key, value in prefab_data.items():
        if 'GameObject' in value:
            # print(f"Building node for GameObject: {value['GameObject']['m_Name']}")
            game_object = value['GameObject']
            node = Node(game_object, prefab_data)
            node_map[node.id] = node
            if node.father == '0':
                root = node

    # assert root is not None, "Root node not found"
    return root, node_map

def print_tree(node: Node, node_map: dict, depth=0):
    indent = '  ' * depth
    print(f"{indent}- {node.name} (id: {node.id})")
    for child_id in node.children:
        child_node = node_map.get(child_id)
        print_tree(child_node, node_map, depth + 1)

def main():
    parser = argparse.ArgumentParser(description="构建Prefab的对象树")
    parser.add_argument('-p', '--prefab', type=str, help='Prefab文件路径')
    args = parser.parse_args()

    prefab_data = assemble.parse_prefab(args.prefab)
    root, node_map = build_tree(prefab_data)
    print_tree(root, node_map)

if __name__ == "__main__":
    main()