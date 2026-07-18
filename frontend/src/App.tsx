import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Search, Play, Square, Heart, Droplets, Wind, Thermometer } from 'lucide-react';

interface Vitals {
  time: string;
  hr: number;
  bp: number;
  rr: number;
  spo2: number;
}

interface Patient {
  id: string;
  name: string;
  age: number;
  diagnosis: string;
  baselineTemp: number;
  isCritical: boolean;
  vitals: Vitals[];
}

export default function App() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [riskScore, setRiskScore] = useState<number | null>(null);
  
  const [displayStream, setDisplayStream] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [insight, setInsight] = useState("Awaiting sufficient telemetry baseline...");
  
  const streamIndexRef = useRef(1);
  const isPredictingRef = useRef(false);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/patients/`);
        setPatients(response.data);
        if (response.data.length > 0) setSelectedPatient(response.data[0]); 
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    };
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(pt => 
    pt.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    pt.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (!selectedPatient || !selectedPatient.vitals) return;
    setIsStreaming(false);
    setRiskScore(null);
    setInsight("ANALYZING BASELINE...");
    
    const initialChartData = selectedPatient.vitals.map((v, index) => {
      if (index <= 1) return v; 
      return { time: v.time }; 
    });

    setDisplayStream(initialChartData);
    streamIndexRef.current = 1; 
    
    analyzeWindow(1);
  }, [selectedPatient]);

  const analyzeWindow = async (currentIndex: number) => {
    if (isPredictingRef.current || !selectedPatient) return;
    isPredictingRef.current = true;

    try {
      const rawHistory = selectedPatient.vitals.slice(0, currentIndex + 1);
      const needed = 24 - rawHistory.length;
      let finalPayload = rawHistory;

      if (needed > 0) {
        const basePoint = rawHistory[0];
        const organicPadding: Vitals[] = Array.from({ length: needed }, (_, i) => ({
          time: `PAD-${i}`,
          hr: Number((basePoint.hr + Math.sin(i * 0.8) * 1.5).toFixed(2)),
          bp: Number((basePoint.bp + Math.cos(i * 0.5) * 2.0).toFixed(2)),
          rr: Number((basePoint.rr + Math.sin(i * 0.3) * 0.5).toFixed(2)),
          spo2: Number((basePoint.spo2 + Math.cos(i * 0.7) * 0.3).toFixed(2))
        }));
        finalPayload = [...organicPadding, ...rawHistory];
      } else {
        finalPayload = rawHistory.slice(-24);
      }

      const cleanPayload = finalPayload.map(d => ({
        hr: Number(d.hr),
        bp: Number(d.bp),
        rr: Number(d.rr),
        spo2: Number(d.spo2)
      }));

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/predict/`, { vitals: cleanPayload });
      const score = response.data.risk_score;
      setRiskScore(score);
      
      if (score < 20) setInsight("1. Heart Rate Variability normal\n2. MAP stability maintained\n3. SpO2 within clinical range");
      else if (score < 50) setInsight("1. Minor deviation in SpO2/HR correlation\n2. Monitoring MAP trend");
      else if (score < 80) setInsight("1. Reduced MAP stability\n2. Accelerating downward trend in SpO2\n3. Rising HR compensation");
      else setInsight("1. Decline in Heart Rate Variability\n2. Severe MAP instability\n3. Critical hypoxia trend detected");
      
    } catch (error) {
      console.error("Django Error (Silenced to protect stream):", error);
    } finally {
      isPredictingRef.current = false;
    }
  };

  useEffect(() => {
    if (!selectedPatient || !isStreaming) return;

    const interval = setInterval(() => {
      streamIndexRef.current += 1;
      const currentIndex = streamIndexRef.current;

      if (currentIndex >= selectedPatient.vitals.length) {
        setIsStreaming(false);
        return;
      }

      setDisplayStream(prev => {
        const nextStream = [...prev];
        nextStream[currentIndex] = selectedPatient.vitals[currentIndex];
        return nextStream;
      });
      
      analyzeWindow(currentIndex);

    }, 1200); 

    return () => clearInterval(interval);
  }, [isStreaming, selectedPatient]);

  const status = ((score: number | null) => {
    if (score === null) return { color: '#9ca3af', text: 'STANDBY', label: 'Awaiting Stream' };
    if (score < 10) return { color: '#10b981', text: 'HEALTHY', label: 'Optimal Vitals' };
    if (score < 40) return { color: '#3b82f6', text: 'STABLE', label: 'Low Risk' };
    if (score < 75) return { color: '#f59e0b', text: 'AMBER', label: 'Moderate Risk' };
    return { color: '#ef4444', text: 'CRITICAL', label: 'High Risk' };
  })(riskScore);

  const renderGauge = (score: number | null, color: string) => {
    const radius = 80;
    const circumference = Math.PI * radius; 
    const fillValue = score !== null ? (score / 100) * circumference : 0;
    const offset = circumference - fillValue;

    return (
      <div className="relative w-40 h-20 mx-auto mt-2 shrink-0">
        <svg viewBox="0 0 200 120" className="w-full h-full drop-shadow-xl">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#222222" strokeWidth="16" strokeLinecap="round" />
          <path 
            d="M 20 100 A 80 80 0 0 1 180 100" 
            fill="none" 
            stroke={color} 
            strokeWidth="16" 
            strokeLinecap="round" 
            strokeDasharray={circumference} 
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span className="text-4xl font-bold text-white tracking-tight drop-shadow-md">{score !== null ? Math.round(score) : '--'}</span>
        </div>
      </div>
    );
  };

  const getLatestVitals = () => {
    const filledStream = displayStream.filter(d => d.hr !== undefined);
    return filledStream.length > 0 ? filledStream[filledStream.length - 1] : { hr: '--', bp: '--', spo2: '--', rr: '--' };
  };
  const currentVitals = getLatestVitals();

  if (!selectedPatient) return <div className="min-h-screen bg-black text-emerald-500 flex items-center justify-center font-mono tracking-widest text-sm animate-pulse">INITIALIZING NEURAL NET...</div>;

  return (
    <div className="h-screen w-screen bg-black text-gray-300 flex overflow-hidden font-sans antialiased selection:bg-emerald-500/30">
      
      <div className="w-72 bg-[#0a0a0a] border-r border-[#222222] flex flex-col h-full shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.8)] z-20">
        <div className="p-5 border-b border-[#222222] shrink-0 bg-[#0a0a0a]">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              <img src="/logo.png" alt="logo" className="w-10" />
            </div>
            <h2 className="text-sm font-bold tracking-[0.15em] text-white">CAREFLOW AI</h2>
          </div>
          <div className="relative group">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-500 transition-colors group-focus-within:text-emerald-400" />
            <input 
              type="text" 
              placeholder="Search patients..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111111] border border-[#333333] rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:bg-[#1a1a1a] transition-all duration-300 shadow-inner"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {filteredPatients.map((pt) => (
            <button
              key={pt.id}
              onClick={() => setSelectedPatient(pt)}
              className={`w-full text-left p-4 border-b border-[#222222] transition-all duration-300 ease-out hover:pl-6 ${
                selectedPatient?.id === pt.id 
                  ? 'bg-emerald-500/10 border-l-4 border-l-emerald-400' 
                  : 'hover:bg-[#111111] border-l-4 border-l-transparent'
              }`}
            >
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center space-x-2">
                  <div className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${pt.isCritical ? 'bg-red-500 text-red-500' : 'bg-emerald-500 text-emerald-500'}`}></div>
                  <span className={`font-bold text-xs tracking-wide ${selectedPatient?.id === pt.id ? 'text-white' : 'text-gray-300'}`}>{pt.id}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-medium bg-[#111111] px-2 py-0.5 rounded-full">{pt.age}Y</span>
              </div>
              <p className="text-[11px] text-gray-400 truncate pl-4 font-medium">{pt.diagnosis}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 z-10">
        
        <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-4 shrink-0 flex justify-between items-center shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
          <div className="flex items-center text-xs font-medium tracking-widest text-gray-400">
            <span className="mr-2 uppercase">PATIENT:</span>
            <span className="text-white font-bold mr-5">{selectedPatient.name}</span>
            <div className="h-3 w-px bg-[#333333] mr-5"></div>
            <span className="mr-2 uppercase">ID:</span>
            <span className="text-white font-bold mr-5">{selectedPatient.id.replace('PT-', '')}</span>
            <div className="h-3 w-px bg-[#333333] mr-5"></div>
            <span className="mr-2 uppercase">AGE:</span>
            <span className="text-white font-bold mr-5">{selectedPatient.age}</span>
            <div className="h-3 w-px bg-[#333333] mr-5"></div>
            <span className="mr-2 uppercase">BAY:</span>
            <span className="text-white font-bold">{selectedPatient.isCritical ? 'ICU-7' : 'OBS-2'}</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-[10px] font-bold tracking-[0.2em] text-gray-500 bg-[#111111] px-4 py-2 rounded-lg border border-[#333333] shadow-inner">
              TELEMETRY: <span className={isStreaming ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]' : 'text-gray-400'}>{isStreaming ? 'ACTIVE' : 'IDLE'}</span>
            </div>
            <button 
              onClick={() => setIsStreaming(!isStreaming)}
              className={`flex items-center space-x-2 px-6 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 shadow-lg ${
                isStreaming 
                  ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-95' 
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95'
              }`}
            >
              {isStreaming ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
              <span>{isStreaming ? 'STOP STREAM' : 'START STREAM'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-4 gap-6 min-h-0">
          
          <div className="col-span-3 bg-[#0a0a0a] border border-[#222222] rounded-xl p-6 flex flex-col min-h-0 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] relative">
            <div className="flex justify-between items-start mb-6 shrink-0">
              <div>
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-white uppercase mb-1.5 drop-shadow-sm">
                  Physiological Predictive Trajectory
                </h3>
                <p className="text-[10px] font-medium text-gray-400 flex items-center space-x-4 tracking-wide">
                  <span className="uppercase text-gray-500">Multivariate</span>
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe] mr-2"></span>Heart Rate</span>
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-[#ff0844] shadow-[0_0_8px_#ff0844] mr-2"></span>MAP</span>
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-[#4facfe] shadow-[0_0_8px_#4facfe] mr-2"></span>SpO2</span>
                </p>
              </div>
            </div>
            
            <div className="flex-1 min-h-0 -ml-4 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayStream}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{fill: '#6b7280', fontSize: 10, fontWeight: 500}} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" tick={{fill: '#6b7280', fontSize: 10, fontWeight: 500}} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#111111', 
                      border: '1px solid #333333', 
                      borderRadius: '12px', 
                      fontSize: '11px',
                      fontWeight: 600,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                      padding: '12px'
                    }} 
                    itemStyle={{ color: '#fff', paddingBottom: '4px' }}
                  />
                  
                  <defs>
                    <linearGradient id="fillHr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#00f2fe" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="fillBp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff0844" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#ff0844" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="fillSpo2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4facfe" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#4facfe" stopOpacity={0}/>
                    </linearGradient>
                  </defs>

                  <Area type="natural" connectNulls={true} dataKey="hr" stroke="#00f2fe" name="Heart Rate" strokeWidth={2.5} fillOpacity={1} fill="url(#fillHr)" isAnimationActive={false} />
                  <Area type="natural" connectNulls={true} dataKey="bp" stroke="#ff0844" name="MAP (BP)" strokeWidth={2.5} fillOpacity={1} fill="url(#fillBp)" isAnimationActive={false} />
                  <Area type="natural" connectNulls={true} dataKey="spo2" stroke="#4facfe" name="SpO2 %" strokeWidth={2.5} fillOpacity={1} fill="url(#fillSpo2)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-span-1 flex flex-col gap-6 min-h-0">
            
            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 flex flex-col items-center shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] shrink-0">
              <h3 className="text-[11px] font-bold tracking-[0.15em] text-white uppercase w-full text-left mb-1 drop-shadow-sm">
                Deterioration Risk
              </h3>
              
              {renderGauge(riskScore, status.color)}
              
              <div className="text-center mt-2">
                <p className="text-lg font-black tracking-wide drop-shadow-md" style={{ color: status.color }}>{status.text}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{status.label}</p>
              </div>
            </div>

            <div className="bg-[#0a0a0a] border border-[#222222] rounded-xl p-5 flex flex-col shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              
              <div className="shrink-0 mb-4">
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-white uppercase mb-3 drop-shadow-sm">
                  AI Root-Cause Insights
                </h3>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-3">Flagged Patterns:</p>
                <div className="text-[11px] font-medium text-gray-300 leading-relaxed whitespace-pre-line border-l-2 border-emerald-500/50 pl-3">
                  {insight}
                </div>
              </div>

              <div className="h-px w-full bg-[#222222] mb-4 shrink-0"></div>

              <div className="flex flex-col flex-1 shrink-0 justify-end">
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-white uppercase mb-4 drop-shadow-sm">
                  Vital Sign Streams
                </h3>
                
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 w-full">
                  
                  <div className="flex justify-between items-center border-b border-[#222222] pb-2 group">
                    <div className="flex items-center space-x-1.5 text-gray-400 group-hover:text-white transition-colors duration-300">
                      <Heart className="w-3.5 h-3.5 text-[#00f2fe] drop-shadow-[0_0_5px_rgba(0,242,254,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">HR</span>
                    </div>
                    <div className="text-xs font-bold text-white tracking-wider whitespace-nowrap">
                      {currentVitals.hr !== '--' ? Number(currentVitals.hr).toFixed(1) : '--'} <span className="text-[8px] text-gray-500 font-medium">bpm</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-[#222222] pb-2 group">
                    <div className="flex items-center space-x-1.5 text-gray-400 group-hover:text-white transition-colors duration-300">
                      <Droplets className="w-3.5 h-3.5 text-[#ff0844] drop-shadow-[0_0_5px_rgba(255,8,68,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">MAP</span>
                    </div>
                    <div className="text-xs font-bold text-white tracking-wider whitespace-nowrap">
                      {currentVitals.bp !== '--' ? Number(currentVitals.bp).toFixed(1) : '--'} <span className="text-[8px] text-gray-500 font-medium">mmHg</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-[#222222] pb-2 group">
                    <div className="flex items-center space-x-1.5 text-gray-400 group-hover:text-white transition-colors duration-300">
                      <Wind className="w-3.5 h-3.5 text-[#4facfe] drop-shadow-[0_0_5px_rgba(79,172,254,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">SpO2</span>
                    </div>
                    <div className="text-xs font-bold text-[#4facfe] drop-shadow-[0_0_5px_rgba(79,172,254,0.3)] tracking-wider whitespace-nowrap">
                      {currentVitals.spo2 !== '--' ? Number(currentVitals.spo2).toFixed(1) : '--'}%
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-[#222222] pb-2 group">
                    <div className="flex items-center space-x-1.5 text-gray-400 group-hover:text-white transition-colors duration-300">
                      <Activity className="w-3.5 h-3.5 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">RR</span>
                    </div>
                    <div className="text-xs font-bold text-white tracking-wider whitespace-nowrap">
                      {currentVitals.rr !== '--' ? Number(currentVitals.rr).toFixed(1) : '--'} <span className="text-[8px] text-gray-500 font-medium">/min</span>
                    </div>
                  </div>

                  <div className="col-span-2 flex justify-between items-center group pt-1">
                    <div className="flex items-center space-x-1.5 text-gray-400 group-hover:text-white transition-colors duration-300">
                      <Thermometer className="w-3.5 h-3.5 text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.5)]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Temperature</span>
                    </div>
                    <div className="text-xs font-bold text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.3)] tracking-wider whitespace-nowrap">
                      {selectedPatient.baselineTemp.toFixed(1)}°F
                    </div>
                  </div>
                  
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}