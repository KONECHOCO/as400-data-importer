import os
import urllib.request
import shutil

url = "https://repo1.maven.org/maven2/net/sf/jt400/jt400/11.2/jt400-11.2.jar"

# Backend lib path
backend_dir = os.path.dirname(os.path.abspath(__file__))
backend_lib = os.path.join(backend_dir, "lib")
os.makedirs(backend_lib, exist_ok=True)
backend_jar = os.path.join(backend_lib, "jt400.jar")

# Agent lib path
agent_lib = os.path.abspath(os.path.join(backend_dir, "..", "agent", "lib"))
os.makedirs(agent_lib, exist_ok=True)
agent_jar = os.path.join(agent_lib, "jt400.jar")

print("Downloading jt400.jar from Maven Central...")
try:
    # Set User-Agent to avoid potential block
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req) as response, open(backend_jar, 'wb') as out_file:
        shutil.copyfileobj(response, out_file)
    print("Saved to backend:", backend_jar)
    
    # Copy to agent directory
    shutil.copy(backend_jar, agent_jar)
    print("Copied to agent:", agent_jar)
    print("JDBC Driver successfully downloaded and installed!")
except Exception as e:
    print("Failed to download or copy jt400.jar:", e)
