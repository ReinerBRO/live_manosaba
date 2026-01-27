import os
import json
import shutil
from psd_tools import PSDImage
from PIL import Image

def ensure_unique_filename(directory, filename):
    """Ensure filename is unique in directory by appending number."""
    name, ext = os.path.splitext(filename)
    counter = 1
    new_filename = filename
    while os.path.exists(os.path.join(directory, new_filename)):
        new_filename = f"{name}_{counter}{ext}"
        counter += 1
    return new_filename

def extract_layer(layer, output_dir, relative_path_prefix):
    """
    Recursively extract layers.
    Returns a dict describing the layer/group structure.
    """
    node = {
        "name": layer.name,
        "visible": layer.visible,
        "opacity": layer.opacity,
        "blend_mode": str(layer.blend_mode).replace('BlendMode.', ''),
    }

    if layer.is_group():
        node["type"] = "group"
        node["children"] = []
        for child in layer:
            child_node = extract_layer(child, output_dir, relative_path_prefix)
            if child_node:
                node["children"].append(child_node)
        # If group is empty, might return None or keep empty? Keeping empty group for structure.
        return node
    else:
        # It's a layer
        if layer.width == 0 or layer.height == 0:
            return None # Skip empty layers

        node["type"] = "layer"
        node["clipping"] = bool(getattr(layer, "clipping", False))
        
        # Save image (use topil to keep pixels even if layer.visible=False)
        image = layer.topil()
        bbox = layer.bbox # (left, top, right, bottom)
        
        if image:
            # Crop to bbox is automatic by layer.composite() usually returning the layer image at its size
            # BUT layer.composite() returns an image the size of the PSD canvas? No, layer.composite() returns cropped image.
            # Let's verify bbox. layer.bbox is relative to canvas.
            
            # Construct filename
            safe_name = "".join([c if c.isalnum() or c in ('_', '-') else '_' for c in layer.name])
            filename = f"{safe_name}.png"
            filename = ensure_unique_filename(output_dir, filename)
            
            image.save(os.path.join(output_dir, filename))
            
            node["image"] = os.path.join(relative_path_prefix, filename)
            node["offset"] = {"x": bbox[0], "y": bbox[1]}
            node["size"] = {"width": bbox[2]-bbox[0], "height": bbox[3]-bbox[1]}
            
            return node
        else:
            return None

def process_psd(psd_path):
    print(f"Processing: {psd_path}")
    parent_dir = os.path.dirname(psd_path)
    base_name = os.path.splitext(os.path.basename(psd_path))[0]
    
    # Target directory: parent/PSD
    target_root = os.path.join(parent_dir, 'PSD')
    parts_dir = os.path.join(target_root, 'parts')
    
    if os.path.exists(target_root):
        print(f"  Target directory exists, cleaning: {target_root}")
        shutil.rmtree(target_root)
    os.makedirs(parts_dir, exist_ok=True)
    
    psd = PSDImage.open(psd_path)
    
    model_data = {
        "character": base_name,
        "canvas_size": {"width": psd.width, "height": psd.height},
        "root": {
            "type": "root",
            "children": []
        }
    }
    
    for layer in psd:
        child_node = extract_layer(layer, parts_dir, "parts")
        if child_node:
            model_data["root"]["children"].append(child_node)
            
    # Save model.json
    json_path = os.path.join(target_root, 'model.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(model_data, f, indent=2, ensure_ascii=False)
        
    print(f"  Done. Saved to {target_root}")

def main():
    # Find all PSD files in asset directory
    root_dir = 'asset'
    psd_files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for f in filenames:
            if f.lower().endswith('.psd'):
                psd_files.append(os.path.join(dirpath, f))
                
    if not psd_files:
        print("No PSD files found in 'asset' directory.")
        return

    print(f"Found {len(psd_files)} PSD files.")
    for psd_file in psd_files:
        try:
            process_psd(psd_file)
        except Exception as e:
            print(f"Failed to process {psd_file}: {e}")

if __name__ == "__main__":
    main()
