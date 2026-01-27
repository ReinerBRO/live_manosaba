from PIL import Image
import numpy as np
from enum import Enum

def _soft_light(bg, fg):
    bg = bg / 255.0
    fg = fg / 255.0
    return 255.0 * ((1 - 2 * fg) * bg ** 2 + 2 * fg * bg)

def _overlay(bg, fg):
    return np.where(bg < 128,
                    2 * bg * fg / 255.0,
                    255 - 2 * (255 - bg) * (255 - fg) / 255.0)

def _multiply(bg, fg):
    return bg * fg / 255.0

def _alpha(_bg, fg):
    return fg

def _general_blend_array(background_array, foreground_array, blend_function):
    arr1 = background_array.astype(np.float32)
    arr2 = foreground_array.astype(np.float32)

    # 提取 alpha 通道
    a1 = arr1[:, :, 3] / 255.0
    a2 = arr2[:, :, 3] / 255.0

    # 计算混合后的 alpha 通道
    a = a1 + a2 - a1 * a2

    r_blend = blend_function(arr1[:, :, 0], arr2[:, :, 0])
    g_blend = blend_function(arr1[:, :, 1], arr2[:, :, 1])
    b_blend = blend_function(arr1[:, :, 2], arr2[:, :, 2])

    r = r_blend * a2 + arr1[:, :, 0] * (1 - a2)
    g = g_blend * a2 + arr1[:, :, 1] * (1 - a2)
    b = b_blend * a2 + arr1[:, :, 2] * (1 - a2)

    # 将结果转换回整数
    r = np.clip(r, 0, 255).astype(np.uint8)
    g = np.clip(g, 0, 255).astype(np.uint8)
    b = np.clip(b, 0, 255).astype(np.uint8)
    a = np.clip(a * 255, 0, 255).astype(np.uint8)

    # 合并通道
    result = np.stack([r, g, b, a], axis=2)
    return result

def _transparent_expand_array(image_array, width, height, position: tuple):
    """array-in / array-out version of transparent_expand."""    
    # 获取原始图像的宽度和高度
    pre_height, pre_width, _ = image_array.shape
    
    new_image_array = np.zeros((height, width, 4), dtype=np.uint8)
    
    new_image_array[position[1] : position[1] + pre_height, position[0] : position[0] + pre_width, :] = image_array
    
    return new_image_array

def _clipping_mask_array(image_array, mask_array):
    arr1 = image_array  # width x height x 4
    arr2 = mask_array   # width x height

    # 提取 alpha 通道
    a1 = arr1[:, :, 3] / 255.0
    a2 = arr2 / 255.0

    # 计算混合后的 alpha 通道
    a = a1 * a2

    arr1[:, :, 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    return arr1

class BlendMode(Enum):
    ALPHA = 0
    MULTIPLY = 1
    OVERLAY = 2
    SOFTLIGHT = 3

class ImageBlender:
    def __init__(self, width, height):
        self.canvas_array = np.zeros((height, width, 4), dtype=np.uint8)
        self.width = width
        self.height = height
        self.mask_map = {}

    def blend(self, image, position: tuple, mode: BlendMode=BlendMode.ALPHA, set_mask_key: str=None, apply_mask_key: str=None):
        image_array = np.array(image)
        expanded_array = _transparent_expand_array(image_array, self.width, self.height, position)

        if set_mask_key is not None:
            mask_array = expanded_array[:, :, 3]
            if set_mask_key in self.mask_map:
                self.mask_map[set_mask_key] = np.maximum(self.mask_map[set_mask_key], mask_array)  # 只保留alpha通道
            else:
                self.mask_map[set_mask_key] = mask_array
        
        if apply_mask_key is not None:
            assert apply_mask_key in self.mask_map, f"Mask with key '{apply_mask_key}' not found."
            expanded_array = _clipping_mask_array(expanded_array, self.mask_map[apply_mask_key])

        if mode == BlendMode.ALPHA:
            self.canvas_array = _general_blend_array(self.canvas_array, expanded_array, _alpha)
        elif mode == BlendMode.MULTIPLY:
            self.canvas_array = _general_blend_array(self.canvas_array, expanded_array, _multiply)
        elif mode == BlendMode.OVERLAY:
            self.canvas_array = _general_blend_array(self.canvas_array, expanded_array, _overlay)
        elif mode == BlendMode.SOFTLIGHT:
            self.canvas_array = _general_blend_array(self.canvas_array, expanded_array, _soft_light)
        else:
            raise ValueError(f"Unsupported blend mode: {mode}")
        
    def image(self):
        return Image.fromarray(self.canvas_array)