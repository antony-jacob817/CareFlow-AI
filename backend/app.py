import os
import json
import joblib
import gc
import numpy as np
import tensorflow as tf
import gradio as gr
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model_artifacts', 'ews_lstm_model.h5')
SCALER_PATH = os.path.join(BASE_DIR, 'model_artifacts', 'vitals_scaler.pkl')

print("Loading AI Model into Hugging Face memory...")
model = tf.keras.models.load_model(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)
gc.collect()
print("Model loaded successfully on ZeroGPU infrastructure.")

@app.post("/api/predict/")
async def predict_risk(request: Request):
    try:
        body = await request.json()
        data = body.get('vitals', [])
        
        if len(data) != 24:
            return JSONResponse({'error': 'Exactly 24 time-steps required.'}, status_code=400)
        
        patient_data = np.array([[d['hr'], d['bp'], d['rr'], d['spo2']] for d in data])
        patient_flat = patient_data.reshape(-1, 4)
        patient_scaled = scaler.transform(patient_flat)
        patient_ready = patient_scaled.reshape(1, 24, 4)
        
        prediction = model.predict(patient_ready, verbose=0)
        risk_percentage = float(prediction[0][0]) * 100
        
        return JSONResponse({
            'status': 'success',
            'risk_score': round(risk_percentage, 2)
        })
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=500)

@app.get("/api/patients/")
async def get_patients():
    try:
        json_path = os.path.join(BASE_DIR, 'patients_db.json')
        with open(json_path, 'r') as f:
            patients_data = json.load(f)
        return JSONResponse(patients_data)
    except FileNotFoundError:
        return JSONResponse({"error": "patients_db.json not found."}, status_code=500)

with gr.Blocks() as demo:
    gr.Markdown("# 📈 CareFlow AI Live API running on ZeroGPU")

app = gr.mount_gradio_app(app, demo, path="/")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7860)