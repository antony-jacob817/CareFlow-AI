from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
import tensorflow as tf
import joblib
import numpy as np
import os
import json
import gc

BASE_DIR = settings.BASE_DIR
MODEL_PATH = os.path.join(BASE_DIR, 'model_artifacts', 'ews_lstm_model.h5')
SCALER_PATH = os.path.join(BASE_DIR, 'model_artifacts', 'vitals_scaler.pkl')

print("Loading AI Model into Django memory...")
model = tf.keras.models.load_model(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)
gc.collect()
print("Garbage collector cleared memory footprint post-initialization.")
print("Model loaded successfully.")

@api_view(['POST'])
def predict_risk(request):
    """
    Expects a JSON payload:
    {
      "vitals": [
        {"hr": 75, "bp": 120, "rr": 16, "spo2": 98},
        ... (24 total hourly records)
      ]
    }
    """
    try:
        data = request.data.get('vitals', [])
        
        if len(data) != 24:
            return Response({'error': 'Exactly 24 time-steps (hours) of data required.'}, status=400)
        
        patient_data = np.array([[d['hr'], d['bp'], d['rr'], d['spo2']] for d in data])
        
        patient_flat = patient_data.reshape(-1, 4)
        patient_scaled = scaler.transform(patient_flat)
        patient_ready = patient_scaled.reshape(1, 24, 4)
        
        prediction = model.predict(patient_ready, verbose=0)
        risk_percentage = float(prediction[0][0]) * 100
        
        return Response({
            'status': 'success',
            'risk_score': round(risk_percentage, 2)
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
def get_patients(request):
    """
    Reads the patients_db.json file and serves the 100 patient profiles.
    """
    try:
        json_path = os.path.join(BASE_DIR, 'patients_db.json')
        with open(json_path, 'r') as f:
            patients_data = json.load(f)
        return Response(patients_data)
    except FileNotFoundError:
        return Response({"error": "patients_db.json not found."}, status=500)