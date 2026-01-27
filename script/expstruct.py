import argparse
import os
import yaml

class ExportStructure:
    def __init__(self):
        self.texture_path = None
        self.sprite_path = {}   # sprite name to path
        self.prefab_path = None
        self.material = {}  # material guid to name

class DiceExportStructure:
    def __init__(self):
        self.texture_path = None
        self.sprite_path_list = []   # list of sprite paths
        self.name = None

def parse_material_guid(meta_path):
    with open(meta_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # 去掉前3行
    data = yaml.safe_load(content)
    # print(f"Material meta data: {data}")
    guid = data['guid']
    return guid

def analyse_export_structure(export_dir):
    asset_dir = os.path.join(export_dir, 
    'ExportedProject', 'Assets')
    result = ExportStructure()

    texture_dir = os.path.join(asset_dir, 'Texture2D')
    texture_file = [f for f in os.listdir(texture_dir) if f.endswith('.png')][0]
    result.texture_path = os.path.join(texture_dir, texture_file)

    sprite_dir = os.path.join(asset_dir, 'Sprite')
    for entry in os.listdir(sprite_dir):
        if entry.endswith('.asset'):
            name = entry.replace('.asset', '')
            result.sprite_path[name] = os.path.join(sprite_dir, entry)

    prefab_dir = os.path.join(asset_dir, '#WitchTrials', 'Prefabs', 'Naninovel', 'Characters', 'LayeredCharacters')
    prefab_file = [f for f in os.listdir(prefab_dir) if f.endswith('.prefab')][0]
    result.prefab_path = os.path.join(prefab_dir, prefab_file)

    material_dir = os.path.join(asset_dir, 'Material')
    for entry in os.listdir(material_dir):
        if entry.endswith('.meta'):
            material_meta_path = os.path.join(material_dir, entry)
            material_name = entry.replace('.mat.meta', '')
            material_guid = parse_material_guid(material_meta_path)
            result.material[material_guid] = material_name

    return result

def is_dice_exportion(export_dir):
    sprite_dir = os.path.join(export_dir, 
    'ExportedProject', 'Assets', 'Sprite')
    return not os.path.exists(sprite_dir)
    
def analyse_dice_exportion(export_dir):
    asset_dir = os.path.join(export_dir, 
    'ExportedProject', 'Assets')
    result = DiceExportStructure()

    texture_dir = os.path.join(asset_dir, 'Texture2D')
    texture_file = [f for f in os.listdir(texture_dir) if f.endswith('.png')][0]
    result.texture_path = os.path.join(texture_dir, texture_file)

    sprite_dir = os.path.join(asset_dir, '#WitchTrials', 'Textures', 'Naninovel', 'Characters', 'DicedSpriteAtlases')
    for entry in os.listdir(sprite_dir):
        if entry.endswith('.asset'):
            if entry[0].isdigit():
                sprite_path = os.path.join(sprite_dir, entry)
                result.sprite_path_list.append(sprite_path)
            else:
                result.name = entry.replace('.asset', '')

    return result

def main():
    parser = argparse.ArgumentParser(description="结构化导出目录")
    parser.add_argument('-d', '--dir', type=str, help='解包文件路径，应为ExportedProject的上级目录')
    args = parser.parse_args()

    export_dir = args.dir

    structure = analyse_export_structure(export_dir)

    print(f"Texture path: {structure.texture_path}\nsprite path: {structure.sprite_path}\nprefab path: {structure.prefab_path}\nmaterial: {structure.material}")

if __name__ == "__main__":
    main()