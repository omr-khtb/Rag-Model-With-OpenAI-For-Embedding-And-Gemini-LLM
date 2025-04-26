import requests

# Set the URL of your FastAPI server
url = "http://127.0.0.1:5000/extract-text/"

# Path to the PDF you want to test
pdf_path = "mybook.pdf"  # <-- Change this to your real file!

import requests

url = "http://127.0.0.1:5000/extract-text/"  # Your running API

with open(pdf_path, "rb") as f:
    files = {"file": (pdf_path, f, "application/pdf")}
    response = requests.post(url, files=files)

# Print the raw JSON
print("\n--- Full Server Response ---\n")
print(response.json())
