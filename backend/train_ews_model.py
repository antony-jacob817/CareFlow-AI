import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
import joblib
import os

def generate_patient_data(num_patients=500, time_steps=24):
    """
    Generates synthetic vital signs for patients over a given number of hours.
    Features: Heart Rate, Systolic BP, Respiratory Rate, SpO2
    """
    data = []
    labels = []
    
    for _ in range(num_patients):
        is_deteriorating = np.random.rand() > 0.7 
        
        hr = np.random.normal(75, 5, time_steps)
        bp = np.random.normal(120, 10, time_steps)
        rr = np.random.normal(16, 2, time_steps)
        spo2 = np.random.normal(98, 1, time_steps)
        
        if is_deteriorating:
            hr[-8:] += np.linspace(5, 30, 8)
            bp[-8:] -= np.linspace(5, 25, 8)
            rr[-8:] += np.linspace(2, 10, 8)
            spo2[-8:] -= np.linspace(1, 8, 8)
            labels.append(1)
        else:
            labels.append(0)
            
        patient_vitals = np.column_stack((hr, bp, rr, spo2))
        data.append(patient_vitals)
        
    return np.array(data), np.array(labels)

print("Generating synthetic patient data...")
X, y = generate_patient_data(num_patients=1000, time_steps=24)

print("Scaling data...")
scaler = MinMaxScaler()
X_flat = X.reshape(-1, 4)
X_scaled_flat = scaler.fit_transform(X_flat)
X_scaled = X_scaled_flat.reshape(X.shape[0], X.shape[1], 4)

os.makedirs('model_artifacts', exist_ok=True)
joblib.dump(scaler, 'model_artifacts/vitals_scaler.pkl')

print("Building LSTM model...")
model = Sequential([
    LSTM(64, return_sequences=True, input_shape=(X_scaled.shape[1], 4)),
    Dropout(0.2),
    LSTM(32),
    Dropout(0.2),
    Dense(16, activation='relu'),
    Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])

print("Training model...")
model.fit(X_scaled, y, epochs=15, batch_size=32, validation_split=0.2)

model.save('model_artifacts/ews_lstm_model.h5')
print("Model and Scaler successfully saved in /model_artifacts/")