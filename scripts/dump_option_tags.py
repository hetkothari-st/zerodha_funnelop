import xml.etree.ElementTree as ET
import json
import os

xml_path = r"C:\Users\SMARTTOUCH\Downloads\MTClient\NSEFO.xml"
context = ET.iterparse(xml_path, events=('end',))

found = False
for event, elem in context:
    if elem.tag.endswith('NSEFO'):
        instr = elem.findtext('InstrumentName')
        if instr == 'OPTIDX':
            data = {}
            for child in elem:
                tag = child.tag.split('}')[-1]
                data[tag] = child.text
            print(json.dumps(data, indent=2))
            found = True
            break
    elem.clear()
if not found:
    print("No OPTIDX found")
