import os
import argparse
import yaml
from PIL import Image
import re
import json
# import time

import breakup
import blend
import ptimer
import run
import objtree
import expstruct

image_cropper = None    # For performance reason, use a global static instance of ImageCropper

def get_blend_mode(guid: str, material: dict):
    material_name: str = material[guid]
    if material_name.startswith('Naninovel_Default'):
        return blend.BlendMode.ALPHA
    elif material_name.startswith('Naninovel_Multiply'):
        return blend.BlendMode.MULTIPLY
    elif material_name.startswith('Naninovel_Overlay'):
        return blend.BlendMode.OVERLAY
    elif material_name.startswith('Naninovel_Softlight'):
        return blend.BlendMode.SOFTLIGHT
    else:
        raise ValueError(f"Unsupported material name: {material_name}")

def get_mask_key(guid: str, material: dict) -> tuple[str|None, str|None]:
    """Returns (set_mask_key, apply_mask_key)"""
    material_name: str = material[guid]
    mask_description_list = material_name.split('#')[-1].split('_')
    if mask_description_list[0] == 'Mask':
        return mask_description_list[1], None
    elif mask_description_list[0] == 'Masked':
        return None, mask_description_list[1]
    else:
        return None, None

def composite_sprites(composition_node_list: list[str], node_map: dict, export_struct: expstruct.ExportStructure):
    transform_list = []
    size_list = []
    # 调整位置到左上角为锚点，Unity坐标系，pixel单位
    for node_id in composition_node_list:
        node = node_map[node_id]
        transform = node.get_global_transform(node_map)
        size = node.get_sprite_size()
        transform_list.append({
            'x': (transform['x'] - size['x'] / 2) * 100, 
            'y': (transform['y'] + size['y'] / 2) * 100})
        size_list.append({
            'x': size['x'] * 100, 
            'y': size['y'] * 100})
        
    min_x = min([t['x'] for t in transform_list])
    max_x = max([t['x'] + s['x'] for t, s in zip(transform_list, size_list)])
    min_y = min([t['y'] - s['y'] for t, s in zip(transform_list, size_list)])
    max_y = max([t['y'] for t in transform_list])
    canvas_width = int(max_x - min_x) + 1   # 防止canvas尺寸因舍入误差，小于组件尺寸
    canvas_height = int(max_y - min_y) + 1
    offset_x = min_x
    offset_y = min_y

    # 计算每个组件在画布上的位置，左上角坐标系
    canvas_positions = []
    for transform, size in zip(transform_list, size_list):
        canvas_x = int(transform['x'] - offset_x)
        canvas_y = int(canvas_height - (transform['y'] - offset_y))
        canvas_positions.append((canvas_x, canvas_y))

    image_blender = blend.ImageBlender(canvas_width, canvas_height)
    for node_id, pos in zip(composition_node_list, canvas_positions):
        node = node_map[node_id]

        # 裁剪组件图像
        sprite_path = export_struct.sprite_path[node.name]
        m_rect = breakup.get_rect(sprite_path)
        cropped_img = image_cropper.crop(m_rect)  

        # 获取混合模式和遮罩信息
        material_guid = node.get_material_guid()
        blend_mode = get_blend_mode(material_guid, export_struct.material)
        set_mask_key, apply_mask_key = get_mask_key(material_guid, export_struct.material)

        # 图层混合
        print(f"Compositing node: {node.name} (id: {node.id}), blend mode: {blend_mode}, set_mask_key: {set_mask_key}, apply_mask_key: {apply_mask_key}")
        image_blender.blend(cropped_img, pos, mode=blend_mode, set_mask_key=set_mask_key, apply_mask_key=apply_mask_key)

    return image_blender.image()

def traverse_objtree(node: objtree.Node, node_map: dict, action_list, include_only=False):
    result = []
    action = action_list.get(node.name, None)
    if action is not None:
        if action == '-':   
            # Exclude
            return result
        elif action == '+': 
            # Include
            if node.has_sprite():
                result.append(node.id)
            pass
        else:   
            # Exclusive '>' action
            for child_id in node.children:
                child_node = node_map.get(child_id)
                if child_node.name == action:
                    assert child_node.has_sprite(), f"Child node {child_node.name} does not have a sprite"
                    result.append(child_id)
                    return result
    elif node.has_sprite() and node.render_enabled() and not include_only:
        result.append(node.id)

    for child_id in node.children:
        child_node = node_map.get(child_id)
        result.extend(traverse_objtree(child_node, node_map, action_list, include_only))

    return result

def parse_composition(composition_map: dict, composition_keys: list[str], objtree_root: objtree.Node, node_map: dict):
    # 构建composition_map字典
    composition_map_dict = { item['Key']: item['Composition'] for item in composition_map if 'Key' in item and 'Composition' in item }

    # 展开composition_keys列表
    composition_list = composition_keys.copy()
    index = 0
    while index < len(composition_list):
        key = composition_list[index]
        if key not in composition_map_dict:
            # 达成终结符
            index += 1
        else:
            value = composition_map_dict[key]
            value_list = value.split(',')

            new_composition_list = []
            new_composition_list.extend(composition_list[:index])
            new_composition_list.extend(value_list)
            new_composition_list.extend(composition_list[index + 1:])
            composition_list = new_composition_list

    # print(f"Expanded Composition List: {composition_list}")

    # 解析每个composition_list项的动作
    action_list = {}
    for item in composition_list:
        if item.find('>') != -1:
            key = item.split('>')[0]
            action = item.split('>')[1]
            # print(f"Exclusive action detected: {item}, key: {key}, action: {action}")
        elif item.find('+') != -1:
            # assert item.endswith('+'), f"Invalid composition item with +: {item}"
            if not item.endswith('+'):
                key = item.replace('+', '/')
                action = '+'
            else:
                key = item.split('+')[0]
                action = '+'
            # print(f"Include action detected: {item}, key: {key}, action: {action}")
        elif item.find('-') != -1:
            assert item.endswith('-'), f"Invalid composition item with -: {item}"
            key = item.split('-')[0]
            action = '-'
            # print(f"Exclude action detected: {item}, key: {key}, action: {action}")
        else:
            print(f"\033[33mWarning: Composition item without action, defaulting to include: {item}\033[0m")
            key = item
            action = '+'
        key = key.split('/')[-1]
        assert key != '', f"Empty key parsed from item: {item}"
        action_list[key] = action

    # print(f"Action List: {action_list}")
    return traverse_objtree(objtree_root, node_map, action_list)

def get_composition_map(prefab_data: dict, objtree_root: objtree.Node):
    return get_composition_component(prefab_data, objtree_root)['MonoBehaviour']['compositionMap']

def get_composition_component(prefab_data: dict, objtree_root: objtree.Node):
    transform = prefab_data[objtree_root.id]
    game_object_id = str(transform['Transform']['m_GameObject']['fileID'])
    game_object = prefab_data[game_object_id]
    m_component = game_object['GameObject']['m_Component']
    for item in m_component:
        component_id = str(item['component']['fileID'])
        component = prefab_data[component_id]
        if 'MonoBehaviour' in component and 'compositionMap' in component['MonoBehaviour']:
            return component

def parse_prefab(prefab_path):
    with open(prefab_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    result = {}
    start_index = None
    for index, line in enumerate(lines): 
        if line.startswith('---') or index == len(lines) - 1:
            if start_index != None:
                id = lines[start_index].split('&')[1].strip()
                yaml_str = ''.join(lines[start_index + 1:index])
                yaml_data = yaml.safe_load(yaml_str)
                result[id] = yaml_data
            start_index = index

    return result

def main(config=None):
    parser = argparse.ArgumentParser(description="根据拆分的立绘组件和Prefab文件重组角色立绘")

    parser.add_argument('-d', '--dir', type=str, help='解包文件路径，应为ExportedProject的上级目录')
    parser.add_argument('-o', '--output', type=str, default='output', help='输出文件夹路径')
    parser.add_argument('-k', '--compositionKeys', type=str, nargs='*', help='需要重组的Composition键名列表')

    timer = ptimer.Timer()
    global_timer = ptimer.Timer()

    if config is not None:
        args = config
    else:
        args = parser.parse_args()  # 解析命令行参数
        args.compositionKeys = [args.compositionKeys]

    export_struct = expstruct.analyse_export_structure(args.dir)

    prefab_data = parse_prefab(export_struct.prefab_path) # 结构化原始Unity Prefab文件

    objtree_root, node_map = objtree.build_tree(prefab_data)

    # objtree.print_tree(objtree_root, node_map)

    composition_map = get_composition_map(prefab_data, objtree_root)

    timer.checkpoint("Prefab parsing")

    global image_cropper
    image_cropper = breakup.ImageCropper(export_struct.texture_path)

    for composition_keys in args.compositionKeys:
        timer = ptimer.Timer()
        composition_node_list = parse_composition(composition_map, composition_keys, objtree_root, node_map) # 分析目标差分立绘的组件列表
        # for node_id in composition_node_list:
        #     node = node_map[node_id]
        #     print(f"- {node.name} (id: {node.id})")

        # return 

        timer.checkpoint("Composition calculating")

        composition_node_list.reverse()

        result = composite_sprites(composition_node_list, node_map, export_struct)  # 重组立绘

        timer.checkpoint("Sprites compositing")

        # 将composition_keys以下划线连接
        figure_name = export_struct.prefab_path.split('/')[-1].split('.')[0]
        figure_tags = '_'.join(composition_keys).replace('/', '_')
        output_file = figure_name + '_' + figure_tags + '.png'
        output_path = os.path.join(args.output, output_file)
        os.makedirs(args.output, exist_ok=True)  # 创建目录

        # result.show()

        result.save(output_path)
        print(f"\033[34mComposited figure saved at {output_path}\033[0m")
        timer.checkpoint("Image saving")
    global_timer.checkpoint("Total time")
    
if __name__ == "__main__":
    main()