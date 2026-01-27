from psd_tools import PSDImage

psd_path = 'asset/characters/Noah/Noah.psd'
try:
    psd = PSDImage.open(psd_path)
    print(f"PSD loaded: {psd_path}")
    print(f"Size: {psd.size}")
    
    print("\nLayer Structure:")
    for layer in psd:
        print(f"- {layer.name} (Visible: {layer.visible}, Kind: {layer.kind})")
        if layer.is_group():
            for child in layer:
                print(f"  - {child.name} (Visible: {child.visible}, Kind: {child.kind})")
                
except Exception as e:
    print(f"Error loading PSD: {e}")
