import yaml
import argparse
import numpy as np
from PIL import Image
from dataclasses import dataclass
import os

from breakup import ImageCropper
import ptimer

image_cropper = None

@dataclass
class MeshSquare:
    # Bottom-left corner
    minx: float
    miny: float
    minu: float
    minv: float
    # Top-right corner
    maxx: float
    maxy: float
    maxu: float
    maxv: float

class ImagePaster:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.canvas_array = np.zeros((height, width, 4), dtype=np.uint8)

    def paste(self, image_array: np.ndarray, position: tuple):
        img_height, img_width = image_array.shape[0:2]

        x, y = position

        self.canvas_array[y:y+img_height, x:x+img_width, :] = image_array

    def image(self):
        return Image.fromarray(self.canvas_array)

def assemble_vertices(mesh_square_list: list[MeshSquare]):
    texture_width, texture_height = image_cropper.get_size()

    max_x = max(mesh.maxx for mesh in mesh_square_list)
    min_x = min(mesh.minx for mesh in mesh_square_list)
    max_y = max(mesh.maxy for mesh in mesh_square_list)
    min_y = min(mesh.miny for mesh in mesh_square_list)
    canvas_width = round((max_x - min_x) * 100)
    canvas_height = round((max_y - min_y) * 100)
    offset_x = -min_x
    offset_y = -min_y

    def mesh_to_texture_rect(mesh: MeshSquare):
        texture_x = round(mesh.minu * texture_width)
        texture_y = round(mesh.minv * texture_height)
        width = round((mesh.maxu - mesh.minu) * texture_width) 
        height = round((mesh.maxv - mesh.minv) * texture_height)
        return {'x': texture_x, 'y': texture_y, 'width': width, 'height': height}

    canvas_positions = []
    cropper_rects = []
    for mesh in mesh_square_list:
        canvas_x = round((mesh.minx + offset_x) * 100)
        canvas_y = round(canvas_height - (mesh.maxy + offset_y) * 100)
        canvas_positions.append( (canvas_x, canvas_y) )
        rect = mesh_to_texture_rect(mesh)
        cropper_rects.append(rect)

    # print(f"canvas positions: {canvas_positions}")
    # print(f"cropper rects: {cropper_rects}")
    # print(f"Canvas size: {canvas_width}x{canvas_height}")
    # print(f"len of cropper_rects: {len(cropper_rects)}, len of canvas_positions: {len(canvas_positions)}")

    timer = ptimer.Timer()
    image_paster = ImagePaster(canvas_width, canvas_height)

    for position, rect in zip(canvas_positions, cropper_rects):
        if not (rect['x'] + rect['width'] <= texture_width 
                and rect['y'] + rect['height'] <= texture_height 
                and rect['x'] >= 0 
                and rect['y'] >= 0):
            print(f"\033[33mWarning: Crop rectangle {rect} exceeds texture size {texture_width}x{texture_height}.\033[0m")
        cropped_image_array = image_cropper.crop_array(rect)
        image_paster.paste(cropped_image_array, position)

    timer.checkpoint("Finished assembling meshes")
    return image_paster.image()

def list_to_points(list):
    points = []
    for i in range(0, len(list) - 1, 2):
        x = list[i]
        y = list[i+1]
        points.append( (x, y) )
    return points

def str_to_float_list(string, width, start_index=None, end_index=None, padding_per=None):
    floats_num = []
    start = start_index if start_index is not None else 0
    end = end_index if end_index is not None else len(string)

    for i in range(start, end, width):
        hex_str = string[i:i+width]
        if padding_per is not None and (i / width + 1) % (padding_per + 1) == 0:
            assert hex_str == '00000000', f"Expected padding zeros at index {i}, got {hex_str}"
            # print(f"\033[33mSkipping padding at index {i}: {hex_str}\033[0m")
            continue
        float_value = np.frombuffer(bytes.fromhex(hex_str), dtype=np.float32)[0]
        floats_num.append(float_value)
    return floats_num

def analyse_mesh_vertices(yaml_data):
    _typeless_data = yaml_data['Sprite']['m_RD']['m_VertexData']['_typelessdata']
    vertex_count = yaml_data['Sprite']['m_RD']['m_SubMeshes'][0]['vertexCount']

    border_index = vertex_count * 8 * 3

    xy_points = list_to_points(str_to_float_list(_typeless_data, 8, end_index=border_index, padding_per=2))
    uv_points = list_to_points(str_to_float_list(_typeless_data, 8, start_index=border_index))
    print(f"border: {vertex_count}, xy points count: {len(xy_points)}, uv points count: {len(uv_points)}")

    assert len(xy_points) == vertex_count, f"Expected {vertex_count} xy points, got {len(xy_points)}"
    assert len(uv_points) == vertex_count, f"Expected {vertex_count} uv points, got {len(uv_points)}"

    mesh_vertices = []
    for xy, uv in zip(xy_points, uv_points):
        mesh_vertices.append( {
            'x': xy[0],
            'y': xy[1],
            'u': uv[0],
            'v': uv[1],
        })

    return mesh_vertices

def vertices_to_mesh_square(mesh_vertices):
    mesh_square_list = []

    for i in range(0, len(mesh_vertices), 4):
        # Left-bottom corner
        minx = min([v['x'] for v in mesh_vertices[i:i+4]])
        miny = min([v['y'] for v in mesh_vertices[i:i+4]])
        minu = min([v['u'] for v in mesh_vertices[i:i+4]])
        minv = min([v['v'] for v in mesh_vertices[i:i+4]])
        # Right-top corner
        maxx = max([v['x'] for v in mesh_vertices[i:i+4]])
        maxy = max([v['y'] for v in mesh_vertices[i:i+4]])
        maxu = max([v['u'] for v in mesh_vertices[i:i+4]])
        maxv = max([v['v'] for v in mesh_vertices[i:i+4]])
                                                   
        # assert maxx - minx < 0.65 and maxy - miny < 0.65 and maxv - minv < 1/52 and maxu - minu < 1/44, f"Quad too large: x range {maxx - minx}, y range {maxy - miny}"

        mesh_square = MeshSquare(
            minx=minx,
            miny=miny,
            minu=minu,
            minv=minv,
            maxx=maxx,
            maxy=maxy,
            maxu=maxu,
            maxv=maxv,
        )
        # assert mesh_square not in mesh_square_list, f"Duplicate square vertex at {mesh_square}"
        mesh_square_list.append(mesh_square)

    return mesh_square_list

def main(arglist=None):
    parser = argparse.ArgumentParser(description="Parse a YAML file.")
    parser.add_argument("-f", "--file", type=str, required=True, help="Path to the YAML file to parse.")
    parser.add_argument("-t", "--texture", type=str, required=True, help="Path to the texture file.")
    parser.add_argument("-o", "--output", type=str, required=True, help="Path to save the output image.")

    if arglist is not None:
        args = arglist
    else:
        args = parser.parse_args()
        args.file = [args.file]

    global image_cropper
    image_cropper = ImageCropper(args.texture)

    for asset_file in args.file:
        with open(asset_file, 'r') as file:
            content = ''.join(file.readlines()[3:])
            data = yaml.safe_load(content)

        mesh_vertices = analyse_mesh_vertices(data)

        mesh_square_list = vertices_to_mesh_square(mesh_vertices)
        print(f"mesh square count: {len(mesh_square_list)}")

        result = assemble_vertices(mesh_square_list)
        # result.show()
        os.makedirs(args.output, exist_ok=True)
        output_path = os.path.join(args.output, os.path.basename(asset_file).replace('.asset', '.png'))
        result.save(output_path)
        print(f"\033[34mSaved assembled image to {output_path}\033[0m")
    
if __name__ == "__main__":
    main()