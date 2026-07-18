import pandas as pd
import json
import math
import random

CSV_FILE = 'raw_data/Synthetic_patient-HealthCare-Monitoring_dataset.csv'
OUTPUT_FILE = 'patients_db.json'

print(f"Reading dataset: {CSV_FILE}...")

try:
    df = pd.read_csv(CSV_FILE)

    df['Abnormal_Count'] = (
        (df['Heart Rate Alert'] == 'ABNORMAL').astype(int) +
        (df['SpO2 Level Alert'] == 'ABNORMAL').astype(int) +
        (df['Blood Pressure Alert'] == 'ABNORMAL').astype(int) +
        (df['Temperature Alert'] == 'ABNORMAL').astype(int)
    )

    stable_patients = df[df['Abnormal_Count'] == 0].head(5)
    critical_patients = df[df['Abnormal_Count'] >= 3].head(5)
    selected_patients = pd.concat([stable_patients, critical_patients])

    output_db = []

    for index, row in selected_patients.iterrows():
        is_critical = row['Abnormal_Count'] >= 3
        
        sys = float(row['Systolic Blood Pressure (mmHg)'])
        dia = float(row['Diastolic Blood Pressure (mmHg)'])
        target_map = (sys + 2 * dia) / 3.0
        target_hr = float(row['Heart Rate (bpm)'])
        target_spo2 = float(row['SpO2 Level (%)'])
        temp_f = round(float(row['Body Temperature (°C)']) * 1.8 + 32, 1)

        start_hr = 70.0
        start_map = 90.0
        start_spo2 = 98.0
        start_rr = 16.0

        vitals = []
        for i in range(48):
            time_str = f"{str(i).zfill(2)}:00"
            
            wave = math.sin(i * 0.4) * 1.5
            noise = random.uniform(-0.5, 0.5)

            if not is_critical:
                hr = target_hr + wave + noise
                bp = target_map + math.cos(i * 0.3) * 2 + noise
                spo2 = target_spo2 + noise * 0.5
                rr = 16 + math.sin(i * 0.2) + noise
            else:
                if i <= 6:
                    progress = 0
                else:
                    progress = ((i - 6) / 41.0) ** 1.5 
                    
                hr = start_hr + (target_hr - start_hr) * progress + wave + noise
                bp = start_map + (target_map - start_map) * progress + math.cos(i * 0.3) * 2 + noise
                spo2 = start_spo2 + (target_spo2 - start_spo2) * progress + noise * 0.5
                
                target_rr = 16 + ((target_hr - 70) * 0.15) 
                rr = start_rr + (target_rr - start_rr) * progress + math.sin(i * 0.2) + noise

            vitals.append({
                "time": time_str,
                "hr": round(hr, 1),
                "bp": round(bp, 1),
                "rr": round(rr, 1),
                "spo2": round(max(0, min(100, spo2)), 1)
            })

        output_db.append({
            "id": f"PT-{row['Patient Number']}",
            "name": f"Patient {row['Patient Number']}",
            "age": random.randint(40, 85),
            "diagnosis": str(row['Predicted Disease']).title(),
            "baselineTemp": temp_f,
            "isCritical": is_critical,
            "vitals": vitals
        })

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output_db, f, indent=4)

    print(f"Success! {len(output_db)} patients generated and saved to {OUTPUT_FILE}.")

except Exception as e:
    print(f"Error generating database: {e}")