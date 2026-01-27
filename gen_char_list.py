import os
import json

root = 'asset/characters'
chars = []
if os.path.exists(root):
    for d in os.listdir(root):
        model_path = os.path.join(root, d, 'PSD', 'model.json')
        if os.path.isdir(os.path.join(root, d)) and os.path.exists(model_path):
            chars.append(d)

output = {'characters': chars}
with open('asset/characters.json', 'w') as f:
    json.dump(output, f)
print(f"Generated asset/characters.json with {len(chars)} characters.")
