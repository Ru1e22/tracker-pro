'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function PokerDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rawTimeline, setRawTimeline] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [stats, setStats] = useState({ profit: 0, roi: 0, itm: 0, count: 0 });
  
  const [startBankroll, setStartBankroll] = useState(338.17);
  const [timeFilter, setTimeFilter] = useState('all');
  
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [archiveFrom, setArchiveFrom] = useState('');
  const [archiveTo, setArchiveTo] = useState('');

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [addForm, setAddForm] = useState({ name: '', buyIn: '', markup: '1.0', maxSold: '0', actuallySold: '0', scheduledDate: '' });
  
  const [editingTourney, setEditingTourney] = useState<any>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', buyIn: '', markup: '1.0', targetAbi: '1.0', time: '' });
  
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateForm, setEditTemplateForm] = useState({ name: '', buyIn: '', markup: '', targetAbi: '', time: '' });

  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ amount: '', reason: '' });

  const [settleModal, setSettleModal] = useState<any>(null);
  const [settleForm, setSettleForm] = useState({ prize: '', bounty: '' });

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatNick, setChatNick] = useState('');

  const [abiBi, setAbiBi] = useState('');
  const [abiMu, setAbiMu] = useState('1.0');
  const [abiTarget, setAbiTarget] = useState('1.00');
  const [abiSold, setAbiSold] = useState('0.0');

  useEffect(() => {
    const initialize = async () => {
      await checkUser();
      await fetchTemplates();
      await loadInitialData();
      await fetchChat();
      setIsLoading(false);
    };
    initialize();
    
    const channel = supabase.channel('public-tracker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => loadInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bankroll_adjustments' }, () => loadInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => loadInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shoutbox' }, () => fetchChat())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if(rawTimeline.length > 0) applyTimeFilter(rawTimeline, startBankroll);
  }, [timeFilter, rawTimeline]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAdmin(!!session);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    if (!error) setIsAdmin(true); else alert("Błąd logowania!");
  };

  const fetchChat = async () => {
    const { data } = await supabase.from('shoutbox').select('*').order('created_at', { ascending: false }).limit(30);
    if(data) setChatMessages(data.reverse());
  };

  const sendChatMessage = async (e: any) => {
    e.preventDefault();
    if(!chatInput.trim()) return;
    const nick = chatNick.trim() || 'Kibic';
    await supabase.from('shoutbox').insert([{ nickname: nick, message: chatInput }]);
    setChatInput('');
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from('tournament_templates').select('*');
    if (data) {
      const sortedData = data.sort((a, b) => {
        if (a.default_time && b.default_time) return a.default_time.localeCompare(b.default_time);
        if (a.default_time && !b.default_time) return -1;
        if (!a.default_time && b.default_time) return 1;
        return a.name.localeCompare(b.name);
      });
      setTemplates(sortedData);
    } else {
      setTemplates([]);
    }
  };

  const loadInitialData = async () => {
    const { data: setItem } = await supabase.from('settings').select('*').eq('id', 'start_bankroll').single();
    let baseBR = 338.17;
    if (setItem) baseBR = Number(setItem.value);
    setStartBankroll(baseBR);
    await fetchData(baseBR);
  };

  const handleEditStartBankroll = async () => {
    const val = prompt("Podaj nowy BAZOWY bankroll startowy (od niego będzie liczyć wykres):", startBankroll.toString());
    if (val !== null && !isNaN(Number(val))) {
      const num = parseFloat(Number(val).toFixed(2));
      const { error } = await supabase.from('settings').upsert({ id: 'start_bankroll', value: num });
      if (error) alert("Błąd bazy: " + error.message);
    }
  };

  const fetchData = async (baseBR: number) => {
    const { data: tData } = await supabase.from('tournaments').select('*');
    const { data: aData } = await supabase.from('bankroll_adjustments').select('*');
    if (!tData) return;

    const timeline: any[] = [
      ...tData.map(t => ({ type: 'tournament', dateObj: t.scheduled_date ? new Date(t.scheduled_date) : new Date(t.created_at), data: t })),
      ...(aData || []).map(a => ({ type: 'adjustment', dateObj: new Date(a.created_at), data: a }))
    ].sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    setRawTimeline(timeline);

    const listSort = [...tData].sort((a, b) => {
      const aMax = Number(a.max_sell_percent || 0); const aAct = Number(a.sold_percent !== null ? a.sold_percent : aMax); const aOffer = !a.is_finished && (aAct < aMax);
      const bMax = Number(b.max_sell_percent || 0); const bAct = Number(b.sold_percent !== null ? b.sold_percent : bMax); const bOffer = !b.is_finished && (bAct < bMax);
      if (aOffer !== bOffer) return aOffer ? -1 : 1;
      if (a.is_finished !== b.is_finished) return a.is_finished ? 1 : -1;
      const dA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : new Date(a.created_at).getTime();
      const dB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : new Date(b.created_at).getTime();
      return !a.is_finished ? dA - dB : dB - dA;
    });
    setTournaments(listSort);
  };

  const applyTimeFilter = (timeline: any[], baseBR: number) => {
    const now = new Date().getTime();
    let cutoff = 0;
    if(timeFilter === '7d') cutoff = now - 7*24*3600*1000;
    if(timeFilter === '30d') cutoff = now - 30*24*3600*1000;
    if(timeFilter === '1y') cutoff = now - 365*24*3600*1000;

    let baselineBR = baseBR;
    let justProfit = 0, totalMyCost = 0, cashed = 0, finishedCount = 0;
    const filteredEvents: any[] = [];

    timeline.forEach((item) => {
      let net = 0; let myCost = 0; let isITM = false;

      if (item.type === 'adjustment') {
        net = Number(item.data.amount);
      } else {
        const t = item.data;
        const actSold = Number(t.sold_percent !== null ? t.sold_percent : Number(t.max_sell_percent || 0));
        const kept = 100 - actSold;
        myCost = t.buy_in - (t.buy_in * (actSold / 100) * t.markup);
        const p = Number(t.prize || 0); const b = Number(t.bounty || 0);
        net = t.is_finished ? (((p + b) * (kept / 100)) - myCost) : 0;
        isITM = p > 0;
      }

      if (item.dateObj.getTime() < cutoff) {
        baselineBR += net; 
      } else {
        filteredEvents.push({ ...item, preCalcNet: net, myCost, isITM });
        if(item.type === 'tournament' && item.data.is_finished) {
          justProfit += net; finishedCount++; totalMyCost += Math.max(0, myCost); if(isITM) cashed++;
        }
      }
    });

    let currentBR = baselineBR;
    const processedChart = filteredEvents.map((item, index) => {
      currentBR += item.preCalcNet;
      const dStr = item.dateObj.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      if (item.type === 'adjustment') return { index: index + 1, dateStr: dStr, net: item.preCalcNet, bankroll: currentBR, isAdj: true, reason: item.data.reason };
      else return { index: index + 1, dateStr: dStr, net: item.preCalcNet, bankroll: currentBR, isAdj: false, tourneyName: item.data.name };
    });

    setStats({ profit: justProfit, roi: totalMyCost > 0 ? (justProfit / totalMyCost) * 100 : 0, itm: finishedCount > 0 ? (cashed / finishedCount) * 100 : 0, count: finishedCount });
    setChartData([{ index: 0, dateStr: 'Start Okresu', bankroll: baselineBR, isStart: true }, ...processedChart]);
  };

  const toggleDeepRun = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'deep_run' ? 'normal' : 'deep_run';
    await supabase.from('tournaments').update({ live_status: newStatus }).eq('id', id);
  };

  const addTournament = async () => {
    if (!addForm.name || !addForm.buyIn) return alert("Podaj nazwę!");
    await supabase.from('tournaments').insert([{ name: addForm.name, buy_in: parseFloat(addForm.buyIn), markup: parseFloat(addForm.markup), max_sell_percent: parseFloat(addForm.maxSold), sold_percent: parseFloat(addForm.actuallySold), scheduled_date: addForm.scheduledDate ? new Date(addForm.scheduledDate).toISOString() : null, is_finished: false }]);
    setAddForm({ name: '', buyIn: '', markup: '1.0', maxSold: '0', actuallySold: '0', scheduledDate: '' });
  };

  const handleBatchInsert = async () => {
    if (batchSelection.length === 0) return alert("Wybierz turnieje z rutyny!");
    
    const insertData = batchSelection.map(tempId => {
      const tmpl = templates.find(t => t.id === tempId);
      let scheduledISO = null;
      if (tmpl.default_time) {
        const [hours, minutes] = tmpl.default_time.split(':');
        const d = new Date();
        d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        scheduledISO = d.toISOString();
      }

      const bi = parseFloat(tmpl.default_buy_in || '0');
      const mu = parseFloat(tmpl.default_markup || '1.0');
      const target = parseFloat(tmpl.target_abi || '1.0');
      let calcSold = 0;
      if (bi > 0 && mu > 0) {
        let s = ((bi - target) / (bi * mu)) * 100;
        s = Math.max(0, Math.min(100, s));
        // 🔥 LOGIKA ZAOKRĄGLANIA: Jeśli BI < 30$, zaokrąglaj do dziesiątek
        if (bi < 30) s = Math.round(s / 10) * 10;
        calcSold = s;
      }

      return {
        name: tmpl.name,
        buy_in: bi,
        markup: mu,
        max_sell_percent: parseFloat(calcSold.toFixed(1)),
        sold_percent: 0,
        scheduled_date: scheduledISO,
        is_finished: false,
        live_status: 'normal'
      };
    });

    const { error } = await supabase.from('tournaments').insert(insertData);
    if (!error) {
      setShowBatchModal(false);
      setBatchSelection([]);
    } else {
      alert("Błąd bazy: " + error.message);
    }
  };

  const toggleBatchSelection = (id: string) => {
    if (batchSelection.includes(id)) setBatchSelection(batchSelection.filter(item => item !== id));
    else setBatchSelection([...batchSelection, id]);
  };
  
  const updateTournament = async () => {
    const p = parseFloat(editingTourney.prize || '0'); const b = parseFloat(editingTourney.bounty || '0');
    await supabase.from('tournaments').update({ 
      name: editingTourney.name, buy_in: parseFloat(editingTourney.buyIn), markup: parseFloat(editingTourney.markup), max_sell_percent: parseFloat(editingTourney.maxSold), sold_percent: parseFloat(editingTourney.actuallySold), 
      scheduled_date: editingTourney.scheduledDate ? new Date(editingTourney.scheduledDate).toISOString() : null,
      prize: editingTourney.is_finished ? p : 0, bounty: editingTourney.is_finished ? b : 0, winnings: editingTourney.is_finished ? (p + b) : 0
    }).eq('id', editingTourney.id);
    setEditingTourney(null);
  };
  
  const handleSettleTournament = async () => {
    const p = parseFloat(settleForm.prize || '0'); const b = parseFloat(settleForm.bounty || '0'); const total = p + b;
    const { error } = await supabase.from('tournaments').update({ winnings: total, prize: p, bounty: b, is_finished: true, live_status: 'normal' }).eq('id', settleModal.id);
    if (!error) { setSettleModal(null); setSettleForm({ prize: '', bounty: '' }); } else alert("Błąd bazy: " + error.message);
  };

  const deleteTournament = async (id: string) => { if (confirm("Na pewno usunąć?")) { await supabase.from('tournaments').delete().eq('id', id); } };
  
  const saveNewTemplate = async () => {
    if(newTemplate.name) { 
      await supabase.from('tournament_templates').insert([{ 
        name: newTemplate.name, 
        default_buy_in: parseFloat(newTemplate.buyIn || '0'),
        default_markup: parseFloat(newTemplate.markup || '1.0'),
        target_abi: parseFloat(newTemplate.targetAbi || '1.0'),
        default_time: newTemplate.time || null
      }]); 
      setNewTemplate({ name: '', buyIn: '', markup: '1.0', targetAbi: '1.0', time: '' }); 
      fetchTemplates(); 
    }
  };

  const saveEditedTemplate = async (id: string) => {
    const { error } = await supabase.from('tournament_templates').update({
      name: editTemplateForm.name,
      default_buy_in: parseFloat(editTemplateForm.buyIn || '0'),
      default_markup: parseFloat(editTemplateForm.markup || '1.0'),
      target_abi: parseFloat(editTemplateForm.targetAbi || '1.0'),
      default_time: editTemplateForm.time || null
    }).eq('id', id);
    
    if (error) {
      alert("Błąd edycji: " + error.message);
    } else {
      setEditingTemplateId(null);
      fetchTemplates();
    }
  };

  const saveAdjustment = async () => { if(adjForm.amount && adjForm.reason) { const { error } = await supabase.from('bankroll_adjustments').insert([{ amount: parseFloat(adjForm.amount), reason: adjForm.reason }]); if (error) alert("Błąd: " + error.message); else { setShowAdjModal(false); setAdjForm({ amount: '', reason: '' }); } } else alert("Wpisz kwotę i powód!"); };
  const deleteAdjustment = async (id: string) => { if (confirm("Na pewno usunąć tę korektę?")) { await supabase.from('bankroll_adjustments').delete().eq('id', id); } };

  const updateAbi = (field: 'bi' | 'mu' | 'target' | 'sold', value: string) => {
    const bi = field === 'bi' ? parseFloat(value) || 0 : parseFloat(abiBi) || 0;
    const mu = field === 'mu' ? parseFloat(value) || 1 : parseFloat(abiMu) || 1;
    const target = field === 'target' ? parseFloat(value) || 0 : parseFloat(abiTarget) || 0;
    const sold = field === 'sold' ? parseFloat(value) || 0 : parseFloat(abiSold) || 0;
    if (field === 'bi') setAbiBi(value); if (field === 'mu') setAbiMu(value); if (field === 'target') setAbiTarget(value); if (field === 'sold') setAbiSold(value);

    if (field === 'bi' || field === 'mu' || field === 'target') {
      if (bi > 0 && mu > 0) { 
        let s = ((bi - target) / (bi * mu)) * 100; 
        s = Math.max(0, Math.min(100, s));
        // 🔥 LOGIKA ZAOKRĄGLANIA W KALKULATORZE
        if (bi < 30) s = Math.round(s / 10) * 10;
        setAbiSold(bi < 30 ? s.toString() : s.toFixed(1)); 
      } else setAbiSold('0');
    } else if (field === 'sold') {
      if (bi > 0) { let t = bi - (bi * (sold / 100) * mu); setAbiTarget(t.toFixed(2)); } else setAbiTarget('0.00');
    }
  };

  const handleCopyAbiToForm = () => { setAddForm({ ...addForm, buyIn: abiBi, markup: abiMu, maxSold: abiSold, actuallySold: '0' }); };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.isStart) return <div className="bg-[#111] p-3 rounded-xl border border-gray-800"><p className="text-yellow-500 font-bold text-xs">Początek okresu</p><p className="font-black text-white">${data.bankroll.toFixed(2)}</p></div>;
      return (
        <div className="bg-[#111] border border-gray-800 p-3 rounded-xl shadow-xl z-50">
          <p className="text-gray-400 text-[10px] mb-1">{data.dateStr}</p>
          {data.isAdj ? (
            <><p className="text-blue-400 font-bold text-xs mb-1">⚙️ Korekta: {data.reason}</p><p className={`font-black ${data.net >= 0 ? 'text-green-400' : 'text-red-500'}`}>{data.net >= 0 ? '+' : '-'}${Math.abs(data.net).toFixed(2)}</p></>
          ) : (
            <><p className="text-white font-bold text-xs mb-1">{data.tourneyName}</p>{data.net !== 0 && (<p className={`font-black ${data.net > 0 ? 'text-green-400' : 'text-red-500'}`}>{data.net > 0 ? 'Zysk: +' : 'Strata: -'}${Math.abs(data.net).toFixed(2)}</p>)}</>
          )}
          <p className="text-yellow-500 font-black mt-2">Bankroll: ${data.bankroll.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) return <div className="min-h-screen bg-[#050505] text-yellow-500 flex items-center justify-center font-black uppercase tracking-widest text-xl animate-pulse">Ładowanie kokpitu... 🚀</div>;

  const activeOffersCount = tournaments.filter(t => !t.is_finished && Number(t.sold_percent !== null ? t.sold_percent : t.max_sell_percent) < Number(t.max_sell_percent || 0)).length;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const displayedTournaments = tournaments.filter(t => {
    if (activeTab === 'history') {
      if (!t.is_finished) return false;
      const tDate = t.scheduled_date ? new Date(t.scheduled_date).getTime() : new Date(t.created_at).getTime();
      if (archiveFrom && tDate < new Date(archiveFrom).getTime()) return false;
      if (archiveTo && tDate > new Date(archiveTo + 'T23:59:59').getTime()) return false;
      return true;
    } else {
      if (!t.is_finished) return true;
      return (t.scheduled_date ? new Date(t.scheduled_date) : new Date(t.created_at)) > yesterday;
    }
  });

  return (
    <main className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans pb-20">
      
      {/* 🚀 KREATOR SESJI / RUTYNA */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 z-[100]">
          <div className="bg-[#111] border border-yellow-500/30 p-6 rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-2xl text-yellow-500 italic uppercase">🚀 Generuj Sesję</h3>
              <button onClick={()=>setShowBatchModal(false)} className="text-gray-500 hover:text-white text-xl font-bold">X</button>
            </div>
            
            <p className="text-sm text-gray-400 mb-4">Wybierz gry na dzisiaj. Aplikacja sama wyliczy procenty sprzedaży na podstawie Twoich ustawień (Target ABI i Markup). Turnieje do $30 są zaokrąglane do równych 10%.</p>
            
            <div className="flex justify-between items-center mb-2 px-2">
              <h4 className="font-bold text-xs uppercase tracking-widest text-gray-500">Twój Harmonogram</h4>
              <div className="flex gap-2">
                <button onClick={() => setBatchSelection(templates.map(t => t.id))} className="text-[10px] text-yellow-500 underline uppercase font-bold">Zaznacz All</button>
                <button onClick={() => setBatchSelection([])} className="text-[10px] text-gray-500 underline uppercase font-bold">Odznacz All</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-black/30 border border-gray-800 rounded-xl p-2 space-y-1 mb-4 custom-scrollbar">
              {templates.length === 0 && <p className="text-gray-600 text-xs p-4 text-center">Baza jest pusta. Ustaw najpierw Szablony Rutyny!</p>}
              {templates.map(t => {
                const target = parseFloat(t.target_abi || '1');
                const mu = parseFloat(t.default_markup || '1');
                const bi = parseFloat(t.default_buy_in || '0');
                let estSold = 0;
                if (bi > 0 && mu > 0) {
                  let s = ((bi - target) / (bi * mu)) * 100;
                  s = Math.max(0, Math.min(100, s));
                  if (bi < 30) s = Math.round(s / 10) * 10;
                  estSold = s;
                }

                return (
                  <label key={t.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${batchSelection.includes(t.id) ? 'bg-yellow-500/10 border border-yellow-500/30' : 'hover:bg-gray-900/50 border border-transparent'}`}>
                    <input type="checkbox" checked={batchSelection.includes(t.id)} onChange={() => toggleBatchSelection(t.id)} className="w-5 h-5 accent-yellow-500 rounded bg-black border-gray-700" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-bold">{t.default_time ? t.default_time.slice(0,5) : 'LIVE'}</span>
                        <span className="font-bold text-sm text-white">{t.name}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        BI: <span className="text-white">${t.default_buy_in}</span> | 
                        MU: <span className="text-white">{t.default_markup}</span> | 
                        Cel ABI: <span className="text-yellow-500 font-bold">${t.target_abi}</span>
                        <span className="ml-2 text-amber-500 font-bold">→ Wystawi: {bi < 30 ? estSold : estSold.toFixed(1)}%</span>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <button onClick={handleBatchInsert} className="w-full bg-yellow-500 text-black p-4 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] transition">Stwórz {batchSelection.length} Gier</button>
          </div>
        </div>
      )}

      {/* MODAL SZABLONÓW / RUTYNY Z EDYCJĄ */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 z-[100]">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between mb-4"><h3 className="font-black text-xl text-yellow-500 italic uppercase">Baza Rutyny</h3><button onClick={()=>setShowTemplatesModal(false)} className="text-gray-500 hover:text-white">X</button></div>
            
            <div className="bg-black/50 p-4 rounded-xl border border-gray-800 mb-6">
              <h4 className="text-xs text-gray-500 font-bold uppercase mb-2">Dodaj turniej do harmonogramu</h4>
              <div className="grid grid-cols-12 gap-2 mb-2">
                <div className="col-span-12 lg:col-span-5"><input placeholder="Nazwa" value={newTemplate.name} onChange={e=>setNewTemplate({...newTemplate,name:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded-lg outline-none text-xs" /></div>
                <div className="col-span-4 lg:col-span-2"><input placeholder="BI $" type="number" step="0.01" value={newTemplate.buyIn} onChange={e=>setNewTemplate({...newTemplate,buyIn:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded-lg outline-none text-xs" /></div>
                <div className="col-span-4 lg:col-span-2"><input placeholder="Godz np. 18:30" type="time" value={newTemplate.time} onChange={e=>setNewTemplate({...newTemplate,time:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded-lg outline-none text-xs text-gray-400" /></div>
                <div className="col-span-4 lg:col-span-3"><button onClick={saveNewTemplate} className="w-full h-full bg-yellow-500 text-black rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-yellow-400">Dodaj</button></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-black p-2 rounded-lg border border-gray-800"><span className="text-[10px] text-gray-500 font-bold uppercase">Markup:</span><input type="number" step="0.01" value={newTemplate.markup} onChange={e=>setNewTemplate({...newTemplate,markup:e.target.value})} className="w-full bg-transparent outline-none text-xs font-bold text-white" /></div>
                <div className="flex items-center gap-2 bg-black p-2 rounded-lg border border-gray-800"><span className="text-[10px] text-gray-500 font-bold uppercase whitespace-nowrap">Target ABI $:</span><input type="number" step="0.01" value={newTemplate.targetAbi} onChange={e=>setNewTemplate({...newTemplate,targetAbi:e.target.value})} className="w-full bg-transparent outline-none text-xs font-bold text-yellow-500" /></div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {templates.map(t => (
                <div key={t.id} className="flex flex-col bg-black/30 p-3 rounded-lg border border-gray-800/50 hover:border-gray-700 transition">
                  {editingTemplateId === t.id ? (
                    <div className="space-y-2 w-full">
                      <input value={editTemplateForm.name} onChange={e=>setEditTemplateForm({...editTemplateForm, name:e.target.value})} className="w-full p-2 bg-black border border-yellow-500/50 rounded outline-none text-xs" />
                      <div className="grid grid-cols-4 gap-2">
                        <div><label className="text-[9px] text-gray-500 block mb-1">BI $</label><input type="number" value={editTemplateForm.buyIn} onChange={e=>setEditTemplateForm({...editTemplateForm, buyIn:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded outline-none text-xs" /></div>
                        <div><label className="text-[9px] text-gray-500 block mb-1">Markup</label><input type="number" step="0.01" value={editTemplateForm.markup} onChange={e=>setEditTemplateForm({...editTemplateForm, markup:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded outline-none text-xs" /></div>
                        <div><label className="text-[9px] text-gray-500 block mb-1">Target ABI</label><input type="number" step="0.01" value={editTemplateForm.targetAbi} onChange={e=>setEditTemplateForm({...editTemplateForm, targetAbi:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded outline-none text-xs text-yellow-500 font-bold" /></div>
                        <div><label className="text-[9px] text-gray-500 block mb-1">Godzina</label><input type="time" value={editTemplateForm.time} onChange={e=>setEditTemplateForm({...editTemplateForm, time:e.target.value})} className="w-full p-2 bg-black border border-gray-800 rounded outline-none text-xs text-gray-300" /></div>
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setEditingTemplateId(null)} className="text-gray-400 hover:text-white text-[10px] font-bold px-3 py-2 bg-gray-800 rounded-lg">Anuluj</button>
                        <button onClick={() => saveEditedTemplate(t.id)} className="text-black text-[10px] font-bold px-4 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg uppercase tracking-widest">Zapisz</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center w-full">
                      <div>
                        <span className="font-bold text-sm block mb-1">{t.name} <span className="text-gray-500 font-normal">(${t.default_buy_in})</span></span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest bg-black px-2 py-1 rounded">Godz: {t.default_time ? t.default_time.slice(0,5) : 'Brak'} | MU: {t.default_markup} | ABI: <span className="text-yellow-500">${t.target_abi}</span></span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {
                          setEditingTemplateId(t.id);
                          setEditTemplateForm({
                            name: t.name, buyIn: t.default_buy_in?.toString() || '0', markup: t.default_markup?.toString() || '1.0',
                            targetAbi: t.target_abi?.toString() || '1.0', time: t.default_time ? t.default_time.slice(0,5) : ''
                          });
                        }} className="text-yellow-500 text-[10px] font-bold px-3 border border-yellow-500/20 py-2 rounded-lg hover:bg-yellow-500/10 transition">Edytuj</button>
                        <button onClick={async()=>{await supabase.from('tournament_templates').delete().eq('id', t.id);fetchTemplates()}} className="text-red-500 text-[10px] font-bold px-3 border border-red-500/20 py-2 rounded-lg hover:bg-red-500/10 transition">Usuń</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* POZOSTAŁE MODALE BEZ ZMIAN */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 z-[100]">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-sm"><h3 className="font-black text-xl mb-4 text-blue-400 italic">Korekta Bankrollu</h3>
            <input type="number" step="0.01" placeholder="Kwota (np. -50 lub 100)" value={adjForm.amount} onChange={e=>setAdjForm({...adjForm, amount:e.target.value})} className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl mb-2 outline-none" />
            <input type="text" placeholder="Powód (np. Wypłata, Bonus)" value={adjForm.reason} onChange={e=>setAdjForm({...adjForm, reason:e.target.value})} className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl mb-4 outline-none" />
            <div className="flex gap-2"><button onClick={()=>setShowAdjModal(false)} className="flex-1 bg-gray-800 p-3 rounded-xl font-bold">Anuluj</button><button onClick={saveAdjustment} className="flex-1 bg-blue-500 text-black p-3 rounded-xl font-bold">Zapisz</button></div>
          </div>
        </div>
      )}

      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 z-[100]">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-sm">
            <h3 className="font-black text-xl mb-1 text-emerald-400 italic">Rozlicz Grę</h3>
            <p className="text-gray-400 text-xs mb-4 font-bold">{settleModal.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Kasa z miejsc (Prize $)</label>
                <input type="number" step="0.01" placeholder="0.00" value={settleForm.prize} onChange={e=>setSettleForm({...settleForm, prize:e.target.value})} className="w-full p-3 bg-black/50 border border-emerald-900/50 rounded-xl outline-none text-emerald-400 font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Złapane Bounty ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={settleForm.bounty} onChange={e=>setSettleForm({...settleForm, bounty:e.target.value})} className="w-full p-3 bg-black/50 border border-blue-900/50 rounded-xl outline-none text-blue-400 font-bold" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setSettleModal(null)} className="flex-1 bg-gray-800 p-3 rounded-xl font-bold uppercase">Anuluj</button>
                <button onClick={handleSettleTournament} className="flex-1 bg-emerald-500 text-black p-3 rounded-xl font-bold uppercase">Rozlicz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingTourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 z-[100]">
          <div className="bg-[#111] border border-yellow-500/30 p-6 rounded-3xl w-full max-w-md">
            <h3 className="font-black text-xl mb-4 text-yellow-500 italic">Edytuj Grę</h3>
            <input value={editingTourney.name} onChange={e=>setEditingTourney({...editingTourney,name:e.target.value})} className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl mb-2" />
            <div className="grid grid-cols-2 gap-2 mb-2"><input type="number" value={editingTourney.buyIn} onChange={e=>setEditingTourney({...editingTourney,buyIn:e.target.value})} className="p-3 bg-black/50 border border-gray-800 rounded-xl" /><input type="number" step="0.01" value={editingTourney.markup} onChange={e=>setEditingTourney({...editingTourney,markup:e.target.value})} className="p-3 bg-black/50 border border-gray-800 rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-2 mb-2"><div><label className="text-[10px] text-gray-500">Max %</label><input type="number" value={editingTourney.maxSold} onChange={e=>setEditingTourney({...editingTourney,maxSold:e.target.value})} className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl" /></div><div><label className="text-[10px] text-yellow-500">Sprzedano %</label><input type="number" value={editingTourney.actuallySold} onChange={e=>setEditingTourney({...editingTourney,actuallySold:e.target.value})} className="w-full p-3 bg-black/50 border border-yellow-500/50 text-yellow-500 rounded-xl" /></div></div>
            
            {editingTourney.is_finished && (
              <div className="grid grid-cols-2 gap-2 mb-2 mt-4 p-3 border border-gray-800 rounded-xl bg-[#0a0a0a]">
                <div><label className="text-[10px] text-emerald-500">Prize $</label><input type="number" value={editingTourney.prize || 0} onChange={e=>setEditingTourney({...editingTourney,prize:e.target.value})} className="w-full p-2 bg-black/50 border border-emerald-900/50 text-emerald-400 rounded-lg outline-none" /></div>
                <div><label className="text-[10px] text-blue-500">Bounty $</label><input type="number" value={editingTourney.bounty || 0} onChange={e=>setEditingTourney({...editingTourney,bounty:e.target.value})} className="w-full p-2 bg-black/50 border border-blue-900/50 text-blue-400 rounded-lg outline-none" /></div>
              </div>
            )}

            <input type="datetime-local" value={editingTourney.scheduledDate} onChange={e=>setEditingTourney({...editingTourney,scheduledDate:e.target.value})} className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl mb-4 text-sm" />
            <div className="flex gap-2"><button onClick={()=>setEditingTourney(null)} className="flex-1 bg-gray-800 p-3 rounded-xl font-bold">Anuluj</button><button onClick={updateTournament} className="flex-1 bg-yellow-500 text-black p-3 rounded-xl font-bold">Zapisz</button></div>
          </div>
        </div>
      )}

      {/* HEADER & STATS */}
      <div className="max-w-[1400px] mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div><h1 className="text-4xl font-black text-yellow-500 italic uppercase">BRTracker</h1><p className="text-gray-500 text-sm italic">Rulezz</p></div>
          {!isAdmin ? (
            <div className="flex gap-2 bg-[#0f0f0f] border border-gray-800 p-2 rounded-xl">
              <input type="email" placeholder="Email" className="bg-transparent text-sm w-32 outline-none text-white placeholder-gray-600 pl-2" onChange={e=>setAuthForm({...authForm, email:e.target.value})} />
              <input type="password" placeholder="Hasło" className="bg-transparent text-sm w-24 outline-none text-white placeholder-gray-600 pl-2" onChange={e=>setAuthForm({...authForm, password:e.target.value})} />
              <button onClick={handleLogin} className="bg-yellow-500 text-black px-3 py-1 rounded-lg font-bold text-xs uppercase hover:bg-yellow-400 transition">Zaloguj</button>
            </div>
          ) : <button onClick={()=>supabase.auth.signOut().then(()=>location.reload())} className="text-gray-500 text-xs underline hover:text-white transition">Wyloguj</button>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 text-center uppercase italic font-bold">
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-3xl flex flex-col justify-center"><p className="text-[10px] text-gray-500 mb-1">Zysk Okresu</p><p className={`text-2xl font-black ${stats.profit >= 0 ? 'text-green-400' : 'text-red-500'}`}>${stats.profit.toFixed(2)}</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-3xl flex flex-col justify-center"><p className="text-[10px] text-gray-500 mb-1">ROI Okresu</p><p className="text-2xl font-black text-yellow-500">{stats.roi.toFixed(1)}%</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-3xl flex flex-col justify-center"><p className="text-[10px] text-gray-500 mb-1">ITM Okresu</p><p className="text-2xl font-black text-blue-400">{stats.itm.toFixed(1)}%</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-3xl relative flex flex-col justify-center">
            <p className="text-[10px] text-gray-500 mb-1 flex justify-center items-center gap-2">
              Bankroll
              {isAdmin && <button onClick={()=>setShowAdjModal(true)} className="text-blue-500 text-[10px] border border-blue-500/30 rounded px-1 hover:bg-blue-500/10 transition">➕ Korekta</button>}
            </p>
            <p className="text-2xl font-black">${(startBankroll + rawTimeline.reduce((sum, item)=>{
              if(item.type==='adjustment') return sum+Number(item.data.amount); 
              const t=item.data; 
              const p = Number(t.prize || 0); const b = Number(t.bounty || 0);
              return sum+(t.is_finished?(((p+b)*(1-Number(t.sold_percent!==null?t.sold_percent:t.max_sell_percent)/100))-(t.buy_in-(t.buy_in*(Number(t.sold_percent!==null?t.sold_percent:t.max_sell_percent)/100)*t.markup))):0);
              },0)).toFixed(2)}</p>
            <p className="text-[9px] text-gray-600 mt-1 flex justify-center items-center gap-1">Start: ${startBankroll.toFixed(2)} {isAdmin && <button onClick={handleEditStartBankroll} className="text-yellow-500 hover:text-yellow-400 text-xs transition">✏️</button>}</p>
          </div>
        </div>

        {/* CHART WIDGET */}
        <div className="bg-[#0f0f0f] border border-gray-800 rounded-3xl p-6 mb-8 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">Wykres</h2>
            <div className="flex gap-1 bg-black p-1 rounded-lg border border-gray-800">
              {['7d', '30d', '1y', 'all'].map(f => (
                <button key={f} onClick={() => setTimeFilter(f)} className={`text-[10px] px-3 py-1 rounded font-bold uppercase ${timeFilter === f ? 'bg-yellow-500 text-black' : 'text-gray-500 hover:text-white'}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs><linearGradient id="colorBR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="index" hide />
                <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="bankroll" stroke="#f59e0b" strokeWidth={3} fill="url(#colorBR)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LISTA TURNIEJÓW */}
          <div className="lg:col-span-2">
            
            <div className="flex justify-between items-end mb-6 border-b border-gray-800 pb-2">
              <div className="flex gap-6">
                <button onClick={() => setActiveTab('live')} className={`text-lg font-black uppercase italic transition-colors ${activeTab === 'live' ? 'text-yellow-500 border-b-2 border-yellow-500 pb-2 -mb-[10px]' : 'text-gray-600 hover:text-gray-400'}`}>
                  🔴 Live & Oferty
                </button>
                <button onClick={() => setActiveTab('history')} className={`text-lg font-black uppercase italic transition-colors ${activeTab === 'history' ? 'text-yellow-500 border-b-2 border-yellow-500 pb-2 -mb-[10px]' : 'text-gray-600 hover:text-gray-400'}`}>
                  📚 Archiwum
                </button>
              </div>
              {activeTab === 'live' && <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest bg-gray-900 px-2 py-1 rounded-lg">Dostępne: <span className="text-amber-400">{activeOffersCount}</span></span>}
            </div>

            {activeTab === 'history' && (
              <div className="flex flex-wrap gap-4 items-center mb-6 bg-[#0a0a0a] p-3 rounded-xl border border-gray-800 shadow-inner">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Filtruj daty:</span>
                <div className="flex gap-2 items-center">
                  <input type="date" value={archiveFrom} onChange={e=>setArchiveFrom(e.target.value)} className="bg-black border border-gray-800 text-gray-300 text-xs p-2 rounded-lg outline-none" />
                  <span className="text-gray-600">-</span>
                  <input type="date" value={archiveTo} onChange={e=>setArchiveTo(e.target.value)} className="bg-black border border-gray-800 text-gray-300 text-xs p-2 rounded-lg outline-none" />
                  {(archiveFrom || archiveTo) && (
                    <button onClick={() => { setArchiveFrom(''); setArchiveTo(''); }} className="text-red-500 text-[10px] font-bold px-2 py-1.5 uppercase border border-red-900/30 bg-red-900/10 rounded-lg hover:bg-red-900/30 transition">Reset</button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {displayedTournaments.length === 0 && (
                <div className="text-center p-10 border border-dashed border-gray-800 rounded-3xl text-gray-600 italic">
                  Brak turniejów w tym widoku.
                </div>
              )}

              {displayedTournaments.map((t) => {
                const maxSold = Number(t.max_sell_percent || 0);
                const actSold = Number(t.sold_percent !== null ? t.sold_percent : maxSold);
                const kept = 100 - actSold;
                
                const p = Number(t.prize || 0);
                const b = Number(t.bounty || 0);
                
                const myC = t.buy_in - (t.buy_in * (actSold / 100) * t.markup);
                const net = t.is_finished ? (((p + b) * (kept / 100)) - myC) : 0;
                
                const schedDate = t.scheduled_date ? new Date(t.scheduled_date) : null;
                const isInc = !t.is_finished && schedDate && schedDate > new Date();
                const isRunning = !t.is_finished && !isInc && (actSold === maxSold || maxSold === 0);
                const isDeepRun = t.live_status === 'deep_run';

                let boxStyle = "bg-[#0f0f0f] border-gray-800";
                let statusBadge = null;

                if (t.is_finished) {
                  const isITM = p > 0;
                  const gotBounty = b > 0;

                  if (isITM) {
                    if (net > 0) {
                      boxStyle = "bg-emerald-950/20 border-emerald-900/50";
                      statusBadge = <span className="text-[12px] font-black text-emerald-400 uppercase tracking-widest">ITM! (+${net.toFixed(2)})</span>;
                    } else {
                      boxStyle = "bg-[#1a1111] border-red-900/30";
                      statusBadge = <span className="text-[12px] font-bold text-red-400 uppercase tracking-widest">CASHED (-${Math.abs(net).toFixed(2)})</span>;
                    }
                  } else if (gotBounty) {
                    if (net > 0) {
                      boxStyle = "bg-sky-950/20 border-sky-900/50";
                      statusBadge = <span className="text-[12px] font-black text-blue-400 uppercase tracking-widest">PROFIT! (+${net.toFixed(2)})</span>;
                    } else {
                      boxStyle = "bg-[#1a1111] border-red-900/30";
                      statusBadge = <span className="text-[12px] font-bold text-blue-400 uppercase tracking-widest">BOUNTY (-${Math.abs(net).toFixed(2)})</span>;
                    }
                  } else {
                    boxStyle = "bg-[#0a0a0a] border-gray-900 opacity-60";
                    statusBadge = <span className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">BUSTED</span>;
                  }
                } else if (actSold < maxSold) {
                  boxStyle = "bg-amber-950/20 border-amber-900/50";
                  statusBadge = <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded-lg uppercase font-bold tracking-widest animate-pulse">Kupuj!</span>;
                } else if (isRunning) {
                  if (isDeepRun) {
                    boxStyle = "bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]";
                    statusBadge = <span className="text-[12px] font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 uppercase tracking-widest animate-pulse">🔥 DEEP RUN!</span>;
                  } else {
                    boxStyle = "bg-[#111] border-gray-800";
                    statusBadge = <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">W GRZE</span>;
                  }
                } else if (isInc) {
                  statusBadge = <span className="text-[10px] text-gray-600 uppercase font-bold tracking-widest">Wkrótce</span>;
                }

                return (
                  <div key={t.id} className={`${boxStyle} border p-4 rounded-2xl flex justify-between items-center group transition-all`}>
                    <div className="italic">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">{schedDate ? schedDate.toLocaleString('pl-PL', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'LIVE'}</span>
                      <h4 className="font-bold text-gray-200 mt-1">{t.name}</h4>
                      
                      <div className="mt-1">
                        <p className="text-[11px] text-gray-500 mb-1">BI: ${t.buy_in} | MU: {t.markup} {isAdmin && <span className="text-yellow-500 font-bold ml-1">| Ty: {kept}%</span>}</p>
                        
                        {t.is_finished && (p > 0 || b > 0) && (
                          <p className="text-[10px] text-gray-400 mb-1 font-bold">
                            Wynik: {p > 0 && <span className="text-emerald-400">Pula: ${p.toFixed(2)}</span>} {p > 0 && b > 0 && "| "} {b > 0 && <span className="text-blue-400">Bounty: ${b.toFixed(2)}</span>}
                          </p>
                        )}

                        {!t.is_finished && actSold < maxSold ? (
                          <p className="text-[13px] font-black text-amber-400 uppercase tracking-wide">{actSold}% OUT OF {maxSold}% SOLD</p>
                        ) : !t.is_finished ? (
                          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">SOLD ({actSold}%)</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 italic">
                      <div className="text-right">{statusBadge}</div>
                      {isAdmin && (
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!t.is_finished && (
                            <>
                              <button onClick={() => toggleDeepRun(t.id, t.live_status)} className="bg-red-900/30 text-red-500 text-[10px] px-2 py-1 rounded">🔥</button>
                              <button onClick={() => { setSettleModal(t); setSettleForm({ prize: '', bounty: '' }); }} className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded uppercase">Ok</button>
                            </>
                          )}
                          <button onClick={() => { let d = t.scheduled_date ? new Date(t.scheduled_date) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); setEditingTourney({...t, maxSold, actuallySold: actSold, scheduledDate: d.toISOString().slice(0,16), prize: p, bounty: b}); }} className="bg-gray-800 text-[10px] px-2 py-1 rounded">⚙️</button>
                          
                          <button onClick={() => deleteTournament(t.id)} className="text-red-500 font-bold px-2">X</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SIDEBAR: SHOUTBOX + KALKULATOR + DODAWANIE */}
          <div className="space-y-6">
            <div className="bg-[#0a0a0a] border border-gray-800 p-4 rounded-3xl flex flex-col h-[400px]">
              <h3 className="font-black text-sm text-yellow-500 uppercase italic mb-3">💬 Rail / Shoutbox</h3>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-3 custom-scrollbar flex flex-col-reverse">
                {chatMessages.length === 0 && <p className="text-gray-600 text-xs italic text-center">Bądź pierwszy, napisz GL!</p>}
                {chatMessages.map(msg => (
                  <div key={msg.id} className="bg-[#111] p-2 rounded-xl border border-gray-900">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-[10px] font-bold text-yellow-500">{msg.nickname}</span>
                      <span className="text-[8px] text-gray-600">{new Date(msg.created_at).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-sm text-gray-300 break-words">{msg.message}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={sendChatMessage} className="mt-auto space-y-2">
                <input type="text" placeholder="Nick (opcjonalnie)" value={chatNick} onChange={e=>setChatNick(e.target.value)} className="w-full bg-[#111] border border-gray-800 p-2 rounded-lg text-xs outline-none" maxLength={15} />
                <div className="flex gap-2">
                  <input type="text" placeholder="Napisz wiadomość..." value={chatInput} onChange={e=>setChatInput(e.target.value)} className="flex-1 bg-[#111] border border-gray-800 p-2 rounded-lg text-sm outline-none" maxLength={100} />
                  <button type="submit" className="bg-yellow-500 text-black px-3 rounded-lg font-bold">Wyślij</button>
                </div>
              </form>
            </div>

            {isAdmin && (
              <>
                {/* KALKULATOR ABI DWUKIERUNKOWY */}
                <div className="bg-[#111] border border-gray-800 p-5 rounded-3xl shadow-xl">
                  <h3 className="font-black text-sm text-yellow-500 uppercase italic mb-3">🧮 Kalkulator ABI</h3>
                  
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">Buy-in $</label>
                      <input type="number" step="0.01" placeholder="0" value={abiBi} onChange={e=>updateAbi('bi', e.target.value)} className="w-full p-2 bg-black/50 border border-gray-800 rounded-lg text-xs outline-none text-white font-bold" />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-500 uppercase font-bold pl-1">Markup</label>
                      <input type="number" step="0.01" value={abiMu} onChange={e=>updateAbi('mu', e.target.value)} className="w-full p-2 bg-black/50 border border-gray-800 rounded-lg text-xs outline-none text-white font-bold" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mb-3 items-end">
                    <div className="bg-[#0a0a0a] border border-gray-800 p-2 rounded-xl">
                      <label className="text-[9px] text-yellow-500 uppercase font-bold pl-1 block mb-1">Twój Koszt (ABI $)</label>
                      <input type="number" step="0.01" value={abiTarget} onChange={e=>updateAbi('target', e.target.value)} className="w-full bg-transparent text-lg font-black outline-none text-yellow-500" />
                    </div>
                    <div className="bg-amber-950/20 border border-amber-900/50 p-2 rounded-xl">
                      <label className="text-[9px] text-amber-500 uppercase font-bold pl-1 block mb-1">Sprzedajesz %</label>
                      <input type="number" step="0.1" value={abiSold} onChange={e=>updateAbi('sold', e.target.value)} className="w-full bg-transparent text-lg font-black outline-none text-amber-400" />
                    </div>
                  </div>
                  
                  <button onClick={handleCopyAbiToForm} className="w-full bg-gray-800 hover:bg-gray-700 text-xs py-2 rounded-lg font-bold uppercase transition text-gray-300">
                    Przenieś do Dodawania ↓
                  </button>
                </div>

                <div className="bg-yellow-500 p-6 rounded-3xl text-black italic font-bold uppercase shadow-2xl relative">
                  
                  <div className="absolute -top-3 -right-3">
                    <button onClick={() => setShowBatchModal(true)} className="bg-white text-black px-4 py-2 rounded-xl font-black text-xs border-[3px] border-[#050505] shadow-lg hover:scale-105 transition-transform uppercase tracking-widest">
                      🚀 Generuj Sesję
                    </button>
                  </div>

                  <h3 className="font-black text-xl mb-4">Dodaj Sesję</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 opacity-60"><label>Nazwa</label><button onClick={() => setShowTemplatesModal(true)}>⚙️ Rutyna / Szablony</button></div>
                      <div className="flex bg-black/10 rounded-xl overflow-hidden border border-black/10">
                        <select onChange={(e) => { const m = templates.find(t => t.id === e.target.value); if(m) setAddForm({ ...addForm, name: m.name, buyIn: m.default_buy_in.toString(), markup: m.default_markup?.toString() || '1.0' }); e.target.value = ""; }} className="w-10 bg-black/20 outline-none text-center appearance-none cursor-pointer hover:bg-black/30"><option value="">▼</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} {t.default_time ? `[${t.default_time.slice(0,5)}]` : ''}</option>)}</select>
                        <input type="text" placeholder="..." value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="w-full p-3 bg-transparent outline-none text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="BI $" value={addForm.buyIn} onChange={e => setAddForm({...addForm, buyIn: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none" />
                      <input type="number" step="0.01" placeholder="MU" value={addForm.markup} onChange={e => setAddForm({...addForm, markup: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="bg-black/10 p-2 rounded-xl text-center"><label className="text-[9px] uppercase font-bold opacity-60 block mb-1">Oferta (Max %)</label><input type="number" value={addForm.maxSold} onChange={e => setAddForm({...addForm, maxSold: e.target.value})} className="w-full bg-transparent text-center font-black outline-none" /></div>
                      <div className="bg-black p-2 rounded-xl text-center border border-yellow-500"><label className="text-[9px] uppercase font-bold text-yellow-500 block mb-1">Sprzedano %</label><input type="number" value={addForm.actuallySold} onChange={e => setAddForm({...addForm, actuallySold: e.target.value})} className="w-full bg-transparent text-center font-black text-yellow-500 outline-none" /></div>
                    </div>
                    <input type="datetime-local" value={addForm.scheduledDate} onChange={e => setAddForm({...addForm, scheduledDate: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none text-xs" />
                    <button onClick={addTournament} className="w-full bg-black text-white font-black py-4 rounded-xl tracking-widest hover:scale-[1.02] transition-transform">Dodaj Pojedynczo</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}