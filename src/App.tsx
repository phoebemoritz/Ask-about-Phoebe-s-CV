import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, VolumeX, Info, Github, Linkedin, Mail, Send } from "lucide-react";
import { AudioStreamer, getMicrophoneStream, encodePCM } from "./lib/audio";

const PHOEBE_CV = `
PHOEBE MORITZ - COMMUNICATIONS INTERN
PROFESSIONAL PROFILE:
Master's student in Creative Strategy seeking an opportunity in communication and digital marketing to leverage strong skills in content creation, project management, and intercultural communication. Currently on an Alternance/Stage schedule: one week in school, two weeks in office.

EXPERIENCE:
- Zleep Health (Growth & Content Marketing Internship, Paris, France, Nov 2025 - March 2026):
  Planned and executed multi-platform content strategies (Instagram, TikTok) with targeted audience segmentation, including scripting, filming, and editing short-form video content. Ran and optimized paid and organic growth campaigns (Meta ads, email campaigns, grassroots outreach on social forums). Managed online communities across multiple platforms, engaging users and collecting insights to inform strategy and improve retention.
- Business English Teacher for adults/professionals (Freelance, Online, Jan 2020 - Sept 2025):
  Designed roadmaps to align with students’ professional goals, from career advancement to international collaboration. Supported clients in presenting personal and professional identities. Integrated digital tools (Wix, Canva, CapCut) for tailored “flipped classroom” experience.
- Madrid “Forges” High School (Language Assistant - CDD, Sept 2023 - June 2024):
  Designed interactive lesson plans and activities for maximum engagement using Canva and Google Slides. Integrated cultural insights into lessons to prepare ~300 students as “global citizens”. Helped students build a confident, academic voice in English.
- Erie Neighborhood House (Assistant Program Manager - CDI, Oct 2018 - July 2023):
  Non-profit organization supporting immigrants and low-income families. Managed Adult Education programs, intake process, and recruitment. Boosted enrollment and retention by 400%. Taught and planned basic-level English & citizenship classes to completion, securing funding (taught in English and Spanish).

FORMATION:
- Masters of Creative Strategy and Strategic Planning (2025-2027, Sup de Pub Paris)
- Bachelors of Psychology (2017-2021, DePaul University - Human Development). Double minor: Spanish and Music Recording.

TECHNICAL SKILLS:
- Tools: Canva, Wix, Adobe Suite, Office Pack, Google Slides, CapCut.
- Platforms: Instagram, TikTok, Meta Ads, Trello, Slack.
- Core: Content Creation, Project Management, Community Management, Growth Marketing.

SOFT SKILLS:
- Teamwork and Leadership, Stress Resistance, Communication, Intercultural Communication.

LANGUAGES:
- English: Native
- French: Conversational
- Spanish: Conversational

HOBBIES: Traveling/Backpacking, Podcasting, Running & Fitness, Junk Journaling.
`;

const SYSTEM_INSTRUCTION = `
You are "Big Apple", the dedicated voice agent for Phoebe Moritz. 
Your personality: Professional, friendly, energetic, and helpful. 
Your voice: You MUST speak with a clear American accent, whether you are speaking English or French. 
Your goal: Answer questions about Phoebe's professional background, skills, and experience based on her CV. 
CV Details: ${PHOEBE_CV}

When the conversation starts, you MUST say exactly: "Hello, I'm Big Apple, what would you like to know about Phoebe?"
Keep your responses concise and conversational, as this is a real-time voice interaction.
If asked about something not in the CV, politely steer the conversation back to Phoebe's professional profile.
`;

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Ready to talk");
  const [transcription, setTranscription] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [textInput, setTextInput] = useState("");

  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const updateLevels = () => {
      if (audioStreamerRef.current) {
        setOutputLevel(audioStreamerRef.current.getOutputLevel());
      }
      animationFrameRef.current = requestAnimationFrame(updateLevels);
    };
    updateLevels();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stopSession();
    };
  }, []);

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim() || !sessionRef.current) return;

    console.log("Sending text input:", textInput);
    sessionRef.current.sendRealtimeInput({
      text: textInput.trim()
    });
    setTextInput("");
    setStatus("Thinking...");
  };

  const startSession = async () => {
    try {
      setStatus("Connecting...");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      audioStreamerRef.current = new AudioStreamer(24000);
      await audioStreamerRef.current.start();

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus("Connected");
            setIsActive(true);
          },
          onmessage: async (message) => {
            console.log("Live API Message received:", message);
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData) {
                  console.log("Audio chunk received, length:", part.inlineData.data.length);
                  audioStreamerRef.current?.addPCMChunk(part.inlineData.data);
                  setStatus("Speaking...");
                }
                if (part.text) {
                  console.log("Transcription received:", part.text);
                  setTranscription(prev => prev + " " + part.text);
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              setStatus("Listening...");
            }

            if (message.serverContent?.interrupted) {
              setStatus("Interrupted");
            }
          },
          onclose: () => {
            stopSession();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setStatus("Error occurred");
            stopSession();
          }
        }
      });

      sessionRef.current = session;
      
      // Start mic and send initial greeting now that session is fully established
      await startMic();
      session.sendRealtimeInput({ 
        text: "Hello! Please introduce yourself as Big Apple and ask how you can help learn about Phoebe." 
      });
      
    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus("Connection failed");
      setIsActive(false);
    }
  };

  const startMic = async () => {
    try {
      const stream = await getMicrophoneStream();
      micStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (isMuted) {
          setInputLevel(0);
          return;
        }
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate input level for visualization
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setInputLevel(rms);

        const base64Data = encodePCM(inputData);
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" }
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      processorRef.current = processor;
    } catch (err) {
      console.error("Mic error:", err);
      setStatus("Microphone error");
    }
  };

  const stopSession = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    
    processorRef.current?.disconnect();
    processorRef.current = null;
    
    audioContextRef.current?.close();
    audioContextRef.current = null;
    
    audioStreamerRef.current?.stop();
    audioStreamerRef.current = null;
    
    setIsActive(false);
    setStatus("Ready to talk");
    setInputLevel(0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans selection:bg-[#ff4e00]/30 overflow-hidden relative">
      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3a1510] rounded-full blur-[120px] opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#ff4e00] rounded-full blur-[150px] opacity-20" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-24 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ff4e00] flex items-center justify-center shadow-[0_0_20px_rgba(255,78,0,0.4)]">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Big Apple</h1>
              <p className="text-xs text-[#e0d8d0]/50 uppercase tracking-widest">Phoebe's Voice Agent</p>
            </div>
          </div>
          <div className="flex gap-4">
            <a href="https://linkedin.com/in/phoebe-moritz-global" target="_blank" rel="noreferrer" className="hover:text-[#ff4e00] transition-colors">
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="mailto:phoebemoritz15@gmail.com" className="hover:text-[#ff4e00] transition-colors">
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </header>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h2 className="text-5xl md:text-7xl font-serif italic mb-4 text-white">Phoebe Moritz</h2>
            <p className="text-lg text-[#e0d8d0]/70 max-w-xl mx-auto leading-relaxed">
              Communications Intern & Creative Strategist. 
              Ask Big Apple about her experience in Paris, her marketing skills, or her background in psychology.
            </p>
          </motion.div>

          {/* Voice Visualizer / Interaction Area */}
          <div className="relative w-64 h-64 flex items-center justify-center mb-12">
            <AnimatePresence>
              {isActive && (
                <>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 0.2 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2, repeatType: "reverse" }}
                    className="absolute inset-0 bg-[#ff4e00] rounded-full blur-3xl"
                  />
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ repeat: Infinity, duration: 4 }}
                    className="absolute inset-4 border border-[#ff4e00]/30 rounded-full"
                  />
                </>
              )}
            </AnimatePresence>

            <button
              onClick={isActive ? stopSession : startSession}
              className={`relative z-20 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                isActive 
                  ? "bg-[#ff4e00] shadow-[0_0_60px_rgba(255,78,0,0.8)] scale-110" 
                  : "bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105"
              }`}
            >
              {isActive && (
                <>
                  <motion.div
                    animate={{ 
                      scale: 1 + inputLevel * 3,
                      opacity: 0.1 + inputLevel * 2
                    }}
                    className="absolute inset-0 bg-white rounded-full pointer-events-none"
                  />
                  <motion.div
                    animate={{ 
                      scale: 1 + outputLevel * 4,
                      opacity: 0.2 + outputLevel * 3
                    }}
                    className="absolute inset-0 border-2 border-[#ff4e00] rounded-full pointer-events-none"
                  />
                </>
              )}
              {isActive ? (
                <div className="relative">
                  <Mic className="w-10 h-10 text-white" />
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 bg-white rounded-full -z-10"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Mic className="w-10 h-10 text-[#ff4e00]" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">Start</span>
                </div>
              )}
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-white/20"}`} />
              <span className="text-sm font-medium text-[#e0d8d0]/80">{status}</span>
            </div>

            {isActive && (
              <form 
                onSubmit={handleSendText}
                className="w-full flex gap-2"
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-6 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#ff4e00]/50 transition-all"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="p-3 rounded-full bg-[#ff4e00] text-white disabled:opacity-50 disabled:bg-white/10 transition-all hover:scale-105 active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            )}

            {isActive && (
              <div className="flex gap-4">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full border transition-all ${
                    isMuted 
                      ? "bg-red-500/20 border-red-500/50 text-red-500" 
                      : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                  }`}
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={stopSession}
                  className="p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                  title="End Session"
                >
                  <MicOff className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Grid */}
        {!isActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
          >
            {[
              { label: "Experience", value: "Zleep Health, Teaching, Non-profit" },
              { label: "Education", value: "Sup de Pub Paris, DePaul University" },
              { label: "Languages", value: "English, French, Spanish" }
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-[#ff4e00] font-bold mb-1">{item.label}</p>
                <p className="text-sm text-[#e0d8d0]/80">{item.value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Footer / Info */}
        <footer className="mt-auto pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 text-xs text-[#e0d8d0]/40 uppercase tracking-widest">
            <span>Paris, France</span>
            <span className="w-1 h-1 bg-white/20 rounded-full" />
            <span>Creative Strategy</span>
          </div>
          <div className="text-[10px] text-[#e0d8d0]/30 max-w-xs text-center md:text-right">
            Powered by Gemini 2.5 Live API. Big Apple is an AI agent trained on Phoebe's professional profile.
          </div>
        </footer>
      </main>

      {/* Transcription Overlay (Subtle) */}
      <AnimatePresence>
        {isActive && transcription && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pointer-events-none"
          >
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-center">
              <p className="text-sm text-[#e0d8d0]/60 italic line-clamp-2">
                {transcription.split(" ").slice(-20).join(" ")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
