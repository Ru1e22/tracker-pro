'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function PokerDashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [stats, setStats] = useState({ profit: 0, roi: 0, itm: 0, count: 0 });
  const [startBankroll, setStartBankroll] = useState(337.29);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [addForm, setAddForm] = useState({ name: '', buyIn: '', markup: '1.0', maxSold: '0', actuallySold: '0', scheduledDate: '' });
  const [editingTourney, setEditingTourney] = useState<any>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', buyIn: '' });
  
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ amount: '', reason: '' });

  useEffect(() => {
    checkUser();
    loadInitialData();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAdmin(!!session);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from('tournament_templates').select('*').order('name', { ascending: true });
    setTemplates(data || []);
  };

  const loadInitialData = async () => {
    const { data: setItem } = await supabase.from('settings').select('*').eq('id', 'start_bankroll').single();
    let baseBR = 337.29;
    if (setItem) baseBR = Number(setItem.value);
    setStartBankroll(baseBR);
    
    fetchData(baseBR);
    fetchTemplates();
  };

  const fetchData = async (baseBR: number) => {
    const { data: tData } = await supabase.from('tournaments').select('*');
    const { data: aData } = await supabase.from('bankroll_adjustments').select('*');
    
    if (!tData) return;

    const timeline: any[] = [
      ...tData.map(t => ({
        type: 'tournament',
        dateObj: t.scheduled_date ? new Date(t.scheduled_date) : new Date(t.created_at),
        data: t
      })),
      ...(aData || []).map(a => ({
        type: 'adjustment',
        dateObj: new Date(a.created_at),
        data: a
      }))
    ].sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    let currentBR = baseBR;
    let totalMyCost = 0;
    let cashed = 0;
    let justProfit = 0;
    let finishedCount = 0;
    
    const processedChart = timeline.map((item) => {
      const dateStr = item.dateObj.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      
      if (item.type === 'adjustment') {
        const amt = Number(item.data.amount);
        currentBR += amt;
        return { name: dateStr, net: amt, bankroll: currentBR, isAdj: true, reason: item.data.reason };
      } else {
        const t = item.data;
        const maxSold = Number(t.max_sell_percent || 0);
        const actSold = Number(t.sold_percent !== null ? t.sold_percent : maxSold);
        const kept = 100 - actSold;
        
        const incomeFromSale = t.buy_in * (actSold / 100) * t.markup;
        const myCost = t.buy_in - incomeFromSale;
        const net = t.is_finished ? ((t.winnings * (kept / 100)) - myCost) : 0;
        
        if(t.is_finished) {
          currentBR += net;
          justProfit += net;
          finishedCount++;
          totalMyCost += Math.max(0, myCost);
          if(t.winnings > 0) cashed++;
        }
        return { name: dateStr, net: net, bankroll: currentBR, isAdj: false, tourneyName: t.name };
      }
    });

    setStats({
      profit: justProfit,
      roi: totalMyCost > 0 ? (justProfit / totalMyCost) * 100 : 0,
      itm: finishedCount > 0 ? (cashed / finishedCount) * 100 : 0,
      count: finishedCount
    });
    
    setChartData([{ name: 'Start', bankroll: baseBR, isStart: true }, ...processedChart]);

    // NOWE INTELIGENTNE SORTOWANIE (OFERTY NA GÓRĘ)
    const listSort = [...tData].sort((a, b) => {
      const aMax = Number(a.max_sell_percent || 0);
      const aAct = Number(a.sold_percent !== null ? a.sold_percent : aMax);
      const aOffer = !a.is_finished && (aAct < aMax);

      const bMax = Number(b.max_sell_percent || 0);
      const bAct = Number(b.sold_percent !== null ? b.sold_percent : bMax);
      const bOffer = !b.is_finished && (bAct < bMax);

      // 1. Priorytet: Oferty na samej górze
      if (aOffer !== bOffer) return aOffer ? -1 : 1;
      
      // 2. Priorytet: Nierozliczone nad rozliczonymi
      if (a.is_finished !== b.is_finished) return a.is_finished ? 1 : -1;
      
      // 3. Priorytet: Data (Dla nierozliczonych rosnąco, dla rozliczonych malejąco)
      const dA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : new Date(a.created_at).getTime();
      const dB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : new Date(b.created_at).getTime();
      return !a.is_finished ? dA - dB : dB - dA;
    });
    setTournaments(listSort);
  };

  const addTournament = async () => {
    if (!addForm.name || !addForm.buyIn) return alert("Podaj nazwę i wpisowe!");
    const { error } = await supabase.from('tournaments').insert([{ 
      name: addForm.name, buy_in: parseFloat(addForm.buyIn), markup: parseFloat(addForm.markup), 
      max_sell_percent: parseFloat(addForm.maxSold), sold_percent: parseFloat(addForm.actuallySold),
      scheduled_date: addForm.scheduledDate ? new Date(addForm.scheduledDate).toISOString() : null, is_finished: false 
    }]);
    if (!error) { setAddForm({ name: '', buyIn: '', markup: '1.0', maxSold: '0', actuallySold: '0', scheduledDate: '' }); fetchData(startBankroll); }
  };

  const updateTournament = async () => {
    const { error } = await supabase.from('tournaments').update({
      name: editingTourney.name, buy_in: parseFloat(editingTourney.buyIn), markup: parseFloat(editingTourney.markup),
      max_sell_percent: parseFloat(editingTourney.maxSold), sold_percent: parseFloat(editingTourney.actuallySold),
      scheduled_date: editingTourney.scheduledDate ? new Date(editingTourney.scheduledDate).toISOString() : null
    }).eq('id', editingTourney.id);
    if (!error) { setEditingTourney(null); fetchData(startBankroll); }
  };

  const settleTournament = async (id: string) => {
    const val = prompt("Ile wygrałeś ŁĄCZNIE? (Jeśli 0, wpisz 0)");
    if (val !== null) {
      await supabase.from('tournaments').update({ winnings: parseFloat(val), is_finished: true }).eq('id', id);
      fetchData(startBankroll);
    }
  };

  const saveNewTemplate = async () => {
    if(!newTemplate.name) return;
    await supabase.from('tournament_templates').insert([{ name: newTemplate.name, default_buy_in: parseFloat(newTemplate.buyIn || '0') }]);
    setNewTemplate({ name: '', buyIn: '' });
    fetchTemplates();
  };

  const saveAdjustment = async () => {
    if(!adjForm.amount || !adjForm.reason) return alert("Wpisz kwotę i powód!");
    await supabase.from('bankroll_adjustments').insert([{ amount: parseFloat(adjForm.amount), reason: adjForm.reason }]);
    setShowAdjModal(false); setAdjForm({ amount: '', reason: '' });
    fetchData(startBankroll);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.isStart) return <div className="bg-[#111] p-3 rounded-xl border border-gray-800"><p className="text-yellow-500 font-bold text-xs">Startowy Bankroll</p><p className="font-black text-white">${data.bankroll.toFixed(2)}</p></div>;
      
      return (
        <div className="bg-[#111] border border-gray-800 p-3 rounded-xl shadow-xl z-50">
          <p className="text-gray-400 text-[10px] mb-1">{data.name}</p>
          {data.isAdj ? (
            <>
              <p className="text-blue-400 font-bold text-xs mb-1">⚙️ Korekta: {data.reason}</p>
              <p className={`font-black ${data.net >= 0 ? 'text-green-400' : 'text-red-500'}`}>{data.net >= 0 ? '+' : ''}${data.net.toFixed(2)}</p>
            </>
          ) : (
            <>
              <p className="text-white font-bold text-xs mb-1">{data.tourneyName}</p>
              {data.net !== 0 && (
                <p className={`font-black ${data.net > 0 ? 'text-green-400' : 'text-red-500'}`}>
                  {data.net > 0 ? 'Zysk: +' : 'Strata: '}${data.net.toFixed(2)}
                </p>
              )}
            </>
          )}
          <p className="text-yellow-500 font-black mt-2">Bankroll: ${data.bankroll.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans">
      
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-xl mb-4 text-blue-400 uppercase italic">Korekta Bankrollu</h3>
            <div className="space-y-3">
              <input type="number" step="0.01" placeholder="Kwota (np. -50 lub 100)" value={adjForm.amount} onChange={e => setAdjForm({...adjForm, amount: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none" />
              <input type="text" placeholder="Powód (np. Wypłata, Bonus)" value={adjForm.reason} onChange={e => setAdjForm({...adjForm, reason: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none" />
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAdjModal(false)} className="flex-1 bg-gray-800 py-3 rounded-xl font-bold uppercase">Anuluj</button>
                <button onClick={saveAdjustment} className="flex-1 bg-blue-500 text-black py-3 rounded-xl font-bold uppercase">Zapisz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-lg shadow-2xl">
            <div className="flex justify-between mb-6">
              <h3 className="font-black text-yellow-500 uppercase italic">Baza Turniejów</h3>
              <button onClick={() => setShowTemplatesModal(false)}>X</button>
            </div>
            <div className="flex gap-2 mb-6">
              <input type="text" placeholder="Nazwa..." value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} className="flex-1 p-2 bg-black/50 border border-gray-800 rounded-lg text-sm outline-none" />
              <input type="number" placeholder="BI" value={newTemplate.buyIn} onChange={e => setNewTemplate({...newTemplate, buyIn: e.target.value})} className="w-20 p-2 bg-black/50 border border-gray-800 rounded-lg text-sm text-center outline-none" />
              <button onClick={saveNewTemplate} className="bg-yellow-500 text-black px-4 rounded-lg font-bold text-xs uppercase">Dodaj</button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
              {templates.map(t => (
                <div key={t.id} className="flex justify-between items-center bg-black/30 p-3 rounded-lg border border-gray-800/50">
                  <span className="text-sm">{t.name} (${t.default_buy_in})</span>
                  <button onClick={async () => { await supabase.from('tournament_templates').delete().eq('id', t.id); fetchTemplates(); }} className="text-red-500 text-xs font-bold">Usuń</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingTourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-yellow-500/30 p-6 rounded-3xl w-full max-w-md">
            <h3 className="font-black text-xl mb-4 text-yellow-500 uppercase italic">Edytuj Grę</h3>
            <div className="space-y-3">
              <input type="text" value={editingTourney.name} onChange={e => setEditingTourney({...editingTourney, name: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={editingTourney.buyIn} onChange={e => setEditingTourney({...editingTourney, buyIn: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none text-sm" />
                <input type="number" step="0.01" value={editingTourney.markup} onChange={e => setEditingTourney({...editingTourney, markup: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-gray-500 ml-1">Oferta (Max %)</label>
                  <input type="number" value={editingTourney.maxSold} onChange={e => setEditingTourney({...editingTourney, maxSold: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none text-sm" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-yellow-500 ml-1 font-bold">Sprzedano %</label>
                  <input type="number" value={editingTourney.actuallySold} onChange={e => setEditingTourney({...editingTourney, actuallySold: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-yellow-500/50 outline-none text-sm text-yellow-500 font-bold" />
                </div>
              </div>
              <input type="datetime-local" value={editingTourney.scheduledDate} onChange={e => setEditingTourney({...editingTourney, scheduledDate: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 outline-none text-white text-sm" />
              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditingTourney(null)} className="flex-1 bg-gray-800 py-3 rounded-xl font-bold uppercase">Anuluj</button>
                <button onClick={updateTournament} className="flex-1 bg-yellow-500 text-black py-3 rounded-xl font-bold uppercase">Zapisz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div><h1 className="text-4xl font-black text-yellow-500 italic uppercase">BRTracker</h1><p className="text-gray-500 text-sm italic">Rulezz</p></div>
          {!isAdmin ? (
            <div className="flex gap-2 bg-gray-900/50 p-2 rounded-xl border border-gray-800">
              <input type="email" placeholder="E" className="bg-transparent text-sm w-24 outline-none" onChange={e => setAuthForm({...authForm, email: e.target.value})} />
              <input type="password" placeholder="P" className="bg-transparent text-sm w-24 outline-none" onChange={e => setAuthForm({...authForm, password: e.target.value})} />
              <button onClick={async () => { const {error} = await supabase.auth.signInWithPassword(authForm); if(!error) setIsAdmin(true); }} className="bg-yellow-500 text-black px-4 py-1 rounded-lg font-bold text-xs uppercase">Ok</button>
            </div>
          ) : <button onClick={() => supabase.auth.signOut().then(() => location.reload())} className="text-gray-500 text-xs underline italic">Wyloguj</button>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 text-center uppercase italic font-bold">
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl"><p className="text-[10px] text-gray-500 mb-1">Profit</p><p className={`text-2xl font-black ${stats.profit >= 0 ? 'text-green-400' : 'text-red-500'}`}>${stats.profit.toFixed(2)}</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl"><p className="text-[10px] text-gray-500 mb-1">ROI</p><p className="text-2xl font-black text-yellow-500">{stats.roi.toFixed(1)}%</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl"><p className="text-[10px] text-gray-500 mb-1">ITM</p><p className="text-2xl font-black text-blue-400">{stats.itm.toFixed(1)}%</p></div>
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl relative">
            <p className="text-[10px] text-gray-500 mb-1 flex justify-between items-center">Bankroll {isAdmin && <button onClick={() => setShowAdjModal(true)} className="text-yellow-500 text-sm border border-yellow-500/30 rounded px-1 hover:bg-yellow-500/10 transition">⚙️ Zmień</button>}</p>
            <p className="text-2xl font-black">${(startBankroll + stats.profit + chartData.filter(d=>d.isAdj).reduce((sum,d)=>sum+d.net,0)).toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-[#0f0f0f] border border-gray-800 rounded-3xl p-6 mb-8 h-[350px] shadow-xl">
          <h2 className="text-gray-400 text-xs font-bold uppercase mb-4 tracking-widest text-center">Wykres</h2>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={chartData}>
              <defs><linearGradient id="colorBR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
              <XAxis dataKey="name" stroke="#444" fontSize={10} axisLine={false} tickLine={false} tick={false} />
              <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="bankroll" stroke="#f59e0b" strokeWidth={3} fill="url(#colorBR)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xl font-bold uppercase italic mb-4">📋 Oferta & Historia</h3>
            {tournaments.map((t) => {
              const maxSold = Number(t.max_sell_percent || 0);
              const actSold = Number(t.sold_percent !== null ? t.sold_percent : maxSold);
              const kept = 100 - actSold;
              
              const myC = t.buy_in - (t.buy_in * (actSold / 100) * t.markup);
              const net = t.is_finished ? ((t.winnings * (kept / 100)) - myC) : 0;
              const isInc = !t.is_finished && t.scheduled_date && new Date(t.scheduled_date) > new Date();
              
              let boxStyle = "bg-[#0f0f0f] border-gray-800";
              if (t.is_finished) {
                boxStyle = net > 0 ? "bg-green-900/10 border-green-500/30" : "bg-red-900/10 border-red-500/30";
              } else if (actSold < maxSold) {
                boxStyle = "bg-green-900/5 border-green-500/50";
              }

              return (
                <div key={t.id} className={`${boxStyle} border p-4 rounded-2xl flex justify-between items-center group transition-colors hover:brightness-125`}>
                  <div className="italic">
                    <span className="text-[10px] text-yellow-500 font-bold uppercase">{t.scheduled_date ? new Date(t.scheduled_date).toLocaleString('pl-PL', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'LIVE'}</span>
                    <h4 className="font-bold text-gray-200 mt-1">{t.name}</h4>
                    <p className="text-[11px] text-gray-400 mt-1">
                      BI: ${t.buy_in} | Sprzedano: {actSold}% / {maxSold}% (MU: {t.markup}) 
                      {isAdmin && <span className="text-yellow-500 font-bold ml-1">| Zostawiasz: {kept}%</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 italic">
                    <div className="text-right">
                      {t.is_finished ? (
                        <span className={`font-black ${net >= 0 ? 'text-green-400' : 'text-red-500'}`}>{net >= 0 ? '+' : ''}${net.toFixed(2)}</span>
                      ) : (
                        <span className={`text-[10px] px-2 py-1 rounded-lg uppercase font-bold ${isInc ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-500 animate-pulse'}`}>{isInc ? 'Wkrótce' : 'W grze'}</span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!t.is_finished && <button onClick={() => settleTournament(t.id)} className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded uppercase">Ok</button>}
                        <button onClick={() => { let d = t.scheduled_date ? new Date(t.scheduled_date) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); setEditingTourney({...t, maxSold, actuallySold: actSold, scheduledDate: d.toISOString().slice(0,16)}); }} className="bg-gray-800 text-[10px] px-2 py-1 rounded">⚙️</button>
                        <button onClick={async () => { if(confirm("Na pewno usunąć?")) { await supabase.from('tournaments').delete().eq('id', t.id); fetchData(startBankroll); } }} className="text-red-500 font-bold px-2">X</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="bg-yellow-500 p-6 rounded-3xl text-black h-fit sticky top-8 italic font-bold uppercase shadow-2xl">
              <h3 className="font-black text-xl mb-4">Dodaj Sesję</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] mb-1 opacity-60"><label>Nazwa</label><button onClick={() => setShowTemplatesModal(true)}>⚙️ Baza</button></div>
                  <div className="flex bg-black/10 rounded-xl overflow-hidden border border-black/10">
                    <select onChange={(e) => { const m = templates.find(t => t.name === e.target.value); if(m) setAddForm({ ...addForm, name: m.name, buyIn: m.default_buy_in.toString() }); e.target.value = ""; }} className="w-10 bg-black/20 outline-none text-center appearance-none cursor-pointer hover:bg-black/30">
                      <option value="">▼</option>
                      {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <input type="text" placeholder="..." value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="w-full p-3 bg-transparent outline-none text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] opacity-60 ml-1">Buy-In $</label>
                    <input type="number" placeholder="BI $" value={addForm.buyIn} onChange={e => setAddForm({...addForm, buyIn: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] opacity-60 ml-1">Markup</label>
                    <input type="number" step="0.01" placeholder="MU" value={addForm.markup} onChange={e => setAddForm({...addForm, markup: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="bg-black/10 p-2 rounded-xl text-center border border-black/10">
                    <label className="text-[9px] uppercase font-bold opacity-60 block mb-1">Oferta (Max %)</label>
                    <input type="number" value={addForm.maxSold} onChange={e => setAddForm({...addForm, maxSold: e.target.value})} className="w-full bg-transparent text-center font-black outline-none" />
                  </div>
                  <div className="bg-black p-2 rounded-xl text-center border border-yellow-500">
                    <label className="text-[9px] uppercase font-bold text-yellow-500 block mb-1">Sprzedano %</label>
                    <input type="number" value={addForm.actuallySold} onChange={e => setAddForm({...addForm, actuallySold: e.target.value})} className="w-full bg-transparent text-center font-black text-yellow-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] opacity-60 ml-1">Data Startu</label>
                  <input type="datetime-local" value={addForm.scheduledDate} onChange={e => setAddForm({...addForm, scheduledDate: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 outline-none text-xs" />
                </div>
                <button onClick={addTournament} className="w-full bg-black text-white font-black py-4 rounded-xl tracking-widest shadow-xl hover:scale-[1.02] transition-transform">Wystaw do bazy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}