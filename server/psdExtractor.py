#!/usr/bin/env python3
"""
PSD Extractor - Extract metadata from PSD files using psd-tools
This script is called from Node.js to parse PSD files and extract text layers
"""

import sys
import json
from psd_tools import PSDImage

def extract_psd_info(psd_path):
    """Extract dimensions and text layers from a PSD file"""
    try:
        psd = PSDImage.open(psd_path)
        
        # Extract dimensions
        width = psd.width
        height = psd.height
        
        # Extract text layers
        text_layers = []
        for layer in psd.descendants():
            if layer.kind == 'type':
                text_layers.append({
                    'name': layer.name,
                    'text': layer.text if hasattr(layer, 'text') else '',
                    'x': layer.left if hasattr(layer, 'left') else 0,
                    'y': layer.top if hasattr(layer, 'top') else 0,
                    'width': layer.width if hasattr(layer, 'width') else 0,
                    'height': layer.height if hasattr(layer, 'height') else 0,
                })
        
        result = {
            'success': True,
            'width': width,
            'height': height,
            'textLayers': text_layers,
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        result = {
            'success': False,
            'error': str(e),
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'PSD file path required'}))
        sys.exit(1)
    
    psd_path = sys.argv[1]
    extract_psd_info(psd_path)
