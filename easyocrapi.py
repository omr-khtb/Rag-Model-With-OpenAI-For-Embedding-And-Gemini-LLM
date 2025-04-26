# Filename: easyocrapi.py

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import easyocr
import tempfile
from pdf2image import convert_from_path
import os

app = FastAPI()

# Initialize EasyOCR
reader = easyocr.Reader(["ar", "en"], gpu=True)  # Arabic and English

@app.post("/extract-text/")
async def extract_text(file: UploadFile = File(...)):
    try:
        # Save the uploaded PDF temporarily
        print("Saving PDF...")
        temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        content = await file.read()
        temp_pdf.write(content)
        temp_pdf.close()

        # Convert PDF to images
        images = convert_from_path(temp_pdf.name)

        extracted_text = ""

        for img in images:
            # Save each image temporarily
            print("Processing new page...")
            temp_img = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            img.save(temp_img.name, "PNG")

            # OCR on each page image
            result = reader.readtext(temp_img.name, detail=0, paragraph=True)
            extracted_text += "\n".join(result) + "\n"
            print(f"Extracted text from page: {extracted_text.strip()}")
            # Cleanup temp image
            temp_img.close()
            os.unlink(temp_img.name)

        # Cleanup temp PDF
        os.unlink(temp_pdf.name)

        return JSONResponse(content={"status": "success", "extracted_text": extracted_text.strip()})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
