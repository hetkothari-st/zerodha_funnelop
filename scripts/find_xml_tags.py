import xml.etree.ElementTree as ET
import os

def find_tags(xml_path):
    # Just read the first 100kb to find the structure
    with open(xml_path, 'rb') as f:
        head = f.read(200000)
    
    # Try to find </xs:schema> and see what comes after
    schema_end = head.find(b'</xs:schema>')
    if schema_end != -1:
        data_part = head[schema_end + 12:schema_end + 5000].decode('utf-8', errors='ignore')
        print("Data following schema:")
        print(data_part)

if __name__ == "__main__":
    xml_file = r"C:\Users\SMARTTOUCH\Downloads\MTClient\NSEFO.xml"
    if os.path.exists(xml_file):
        find_tags(xml_file)
    else:
        print("File not found.")
