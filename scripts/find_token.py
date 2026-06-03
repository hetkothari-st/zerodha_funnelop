import json
import os
src_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src", "contracts_nsefo.json")
with open(src_path, 'r') as f:
    data = json.load(f)
    match = [c for c in data if c['t'] == '47585']
    print(json.dumps(match, indent=2))
