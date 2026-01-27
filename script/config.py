import argparse
import os
import json
import yaml

import assemble
import expstruct
import objtree

def main(arglist=None):
    parser = argparse.ArgumentParser(description="生成配置文件")
    parser.add_argument('-d', '--dir', type=str, help='解包文件路径，应为ExportedProject的上级目录')
    parser.add_argument('-o', '--output', type=str, help='配置文件输出目录', default='./configs')

    if arglist is not None:
        args = arglist
    else:
        args = parser.parse_args()

    config = {}
    config['export_dir'] = args.dir

    export_struct = expstruct.analyse_export_structure(args.dir)
    prefab_data = assemble.parse_prefab(export_struct.prefab_path)
    objtree_root, node_map = objtree.build_tree(prefab_data)
    composition_component = assemble.get_composition_component(prefab_data, objtree_root)

    # 获取output_dir_figure和output_dir_sprite
    character_name = os.path.basename(export_struct.prefab_path).split('.')[0]
    config['output_dir_figure'] = os.path.join('output', character_name)
    config['output_dir_sprite'] = os.path.join('output', character_name, 'sprite')

    # 获取composite_keys_list，即compositionMap中所有的起始key
    mono_behaviour = composition_component['MonoBehaviour']
    composition_map = mono_behaviour['compositionMap']
    default_appearance = mono_behaviour['defaultAppearance'].split(',')

    # 剔除 Normal1 之前的key
    start: bool = False
    key_set = set()
    for item in composition_map:
        if item['Key'] == 'Normal1':
            start = True
        if start:
            key_set.add(item['Key'])

    # 剔除composition中作为子项出现过的key
    for item in composition_map:
        composition = item['Composition'].split(',')
        for item in composition:
            clean_item = item.rstrip('+-')
            if clean_item in key_set:
                key_set.remove(clean_item)

    print(f"Remaining keys: {key_set}")
    config['composite_keys_list'] = [default_appearance[:-1] + [key] for key in key_set ]

    output = json.dumps(config, indent=4)
    output_path = os.path.join(args.output, f"{character_name}_config.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)  # 创建目录
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output)

    print(f"\033[34mConfig file saved to {output_path}\033[0m")

    return output_path

if __name__ == "__main__":
    main()