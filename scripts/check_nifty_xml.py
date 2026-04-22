import xml.etree.ElementTree as ET
import json
import os

xml_path = r"C:\Users\SMARTTOUCH\Downloads\MTClient\NSEFO.xml"
context = ET.iterparse(xml_path, events=('end',))

print("Searching for NIFTY 25200 CE in XML...")
found = []
for event, elem in context:
    if elem.tag.endswith('NSEFO'):
        symbol = elem.findtext('Symbol')
        strike = elem.findtext('StrikePrice')
        series = elem.findtext('Series')
        instr = elem.findtext('InstrumentName')
        
        if symbol == 'NIFTY' and instr == 'OPTIDX':
            # print(f"Found: {symbol} {strike} {series}")
            if float(strike) == 25200.0 and series == 'CE':
                found.append({
                    't': elem.findtext('TokenNo'),
                    'e': elem.findtext('ExpiryDate'),
                    'd': elem.findtext('SymbolDesc')
                })
        elem.clear()
    if len(found) >= 5:
        break

print(json.dumps(found, indent=2))
