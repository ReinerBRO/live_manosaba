import os
import json
import shutil

SOURCE_DIR = "asset"
DEST_DIR = "resources"

def migrate():
    if os.path.exists(DEST_DIR):
        print(f"Cleaning {DEST_DIR}...")
        shutil.rmtree(DEST_DIR)
    os.makedirs(DEST_DIR)

    # 1. Copy characters.json
    char_list_path = os.path.join(SOURCE_DIR, "characters.json")
    if not os.path.exists(char_list_path):
        print("Error: content.json not found")
        return

    print(f"Copying {char_list_path}...")
    shutil.copy(char_list_path, os.path.join(DEST_DIR, "characters.json"))

    with open(char_list_path, 'r') as f:
        data = json.load(f)
        character_list = data.get("characters", [])

    total_files = 0
    total_size = 0

    for char_name in character_list:
        # Adjust based on known structure: characters.json is list of {name, id...}
        print(f"Processing {char_name}...")
        
        # Source model path
        model_rel_path = f"characters/{char_name}/PSD/model.json"
        src_model = os.path.join(SOURCE_DIR, model_rel_path)
        
        if not os.path.exists(src_model):
            print(f"  Warning: No model.json for {char_name}, skipping.")
            continue
            
        # Create dest dir
        dest_model_dir = os.path.join(DEST_DIR, os.path.dirname(model_rel_path))
        os.makedirs(dest_model_dir, exist_ok=True)
        
        # Copy model.json
        shutil.copy(src_model, os.path.join(DEST_DIR, model_rel_path))
        total_files += 1
        
        # Parse model.json for images
        with open(src_model, 'r') as f:
            model_data = json.load(f)
            
        images_to_copy = set()
        
        def find_images(node):
            if not node: return
            if node.get("type") == "layer" and node.get("image"):
                images_to_copy.add(node["image"])
            
            for child in node.get("children", []):
                find_images(child)
                
        find_images(model_data.get("root"))
        
        # Copy images
        char_psd_root = os.path.dirname(src_model)
        dest_psd_root = os.path.dirname(os.path.join(DEST_DIR, model_rel_path))
        
        for img_rel in images_to_copy:
            src_img = os.path.join(char_psd_root, img_rel)
            dest_img = os.path.join(dest_psd_root, img_rel)
            
            if os.path.exists(src_img):
                os.makedirs(os.path.dirname(dest_img), exist_ok=True)
                shutil.copy(src_img, dest_img)
                total_files += 1
                total_size += os.path.getsize(src_img)
            else:
                print(f"  Warning: Missing image {img_rel}")

    print(f"\nMigration complete.")
    print(f"Total files: {total_files}")
    print(f"Total size: {total_size / (1024*1024):.2f} MB")

if __name__ == "__main__":
    migrate()
