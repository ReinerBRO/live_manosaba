# import sys
import os
import argparse
import yaml
from PIL import Image
import numpy as np

import expstruct

def preprocess_yaml(yaml_path):
    with open(yaml_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    # 去掉前3行
    content = ''.join(lines[3:])
    return content

def get_rect(sprite_path):
    data = yaml.safe_load(preprocess_yaml(sprite_path))

    sprite = data.get('Sprite', {})
    m_rect = sprite.get('m_Rect', {})
    # print("m_Rect:", m_rect)
    return m_rect

def crop_texture(texture_path, m_rect):
    image = Image.open(texture_path)
    image_array = np.array(image)

    cropped_image_array = _crop_texture_array(image_array, m_rect)
    
    # 将裁剪后的 NumPy 数组转换回 PIL 图像
    cropped_image = Image.fromarray(cropped_image_array)

    return cropped_image

def _crop_texture_array(texture_array, m_rect):
    height, width = texture_array.shape[0:2]

    left = m_rect.get('x', 0)
    right = left + m_rect.get('width', 0)
    lower = height - m_rect.get('y', 0)
    upper = lower - m_rect.get('height', 0)

    cropped_image_array = texture_array[upper:lower, left:right]
    
    return cropped_image_array

class ImageCropper:
    def __init__(self, texture_path):
        self.image = Image.open(texture_path)
        self.width, self.height = self.image.size
        self.image_array = np.array(self.image)

    def crop(self, m_rect):
        cropped_image_array = _crop_texture_array(self.image_array, m_rect)        
        # print(f"Cropping rectangle: {m_rect}, cropped size: {cropped_image_array.shape[1]}x{cropped_image_array.shape[0]}")
        cropped_image = Image.fromarray(cropped_image_array)
        return cropped_image
    
    def crop_array(self, m_rect):
        cropped_image_array = _crop_texture_array(self.image_array, m_rect)        
        return cropped_image_array
    
    def get_size(self):
        return self.width, self.height

def main(config=None):
    parser = argparse.ArgumentParser(description="拆分出立绘组件")
    # parser.add_argument('-s', '--sprite', type=str, help='Sprite目录路径')
    # parser.add_argument('-t', '--texture', type=str, help='Texture文件路径')
    parser.add_argument('-o', '--output', type=str, default='output', help='输出文件夹路径')
    parser.add_argument('-d', '--dir', type=str, help='解包文件路径，应为ExportedProject的上级目录')

    if config is not None:
        args = config
    else:
        args = parser.parse_args()

    export_struct = expstruct.analyse_export_structure(args.dir)
    
    # print(f"Output directory: {args.output}")
    os.makedirs(args.output, exist_ok=True)  # 创建目录

    image_cropper = ImageCropper(export_struct.texture_path)
    # 遍历Sprite目录
    # entries = os.listdir(args.sprite)
    entries = export_struct.sprite_path
    for name, path in entries.items():
        if path.endswith('.asset'):
            # sprite_path = os.path.join(args.sprite, entry)
            output_path = os.path.join(args.output, f"{name}.png")

            m_rect = get_rect(path)
            if m_rect['width'] == 0 or m_rect['height'] == 0:
                print(f"\033[33mWarning: Skipping empty sprite {path}\033[0m")
                continue
            # print(f"m_Rect for {entry}: {m_rect}")
            image_cropper.crop(m_rect).save(output_path)
            print(f"\033[34mCropped image saved to {output_path}\033[0m")

if __name__ == "__main__":
    main()