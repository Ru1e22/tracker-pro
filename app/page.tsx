'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

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

  // Formularze i Modale
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [addForm, setAddForm] = useState({ name: '', buyIn: '', markup: '1.0', sold: '0', scheduledDate: '' });
  const [editingTourney, setEditingTourney] = useState<any>(null);
  
  // Zarządzanie Szablonami
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', buyIn: '' });

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
    if (data) setTemplates(data);
  };

  const loadInitialData = async () => {
    let currentBR = 337.29;
    const { data: setItem } = await supabase.from('settings').select('*').eq('id', 'start_bankroll').single();
    if (setItem) {
      currentBR = Number(setItem.value);
      setStartBankroll(currentBR);
    }
    fetchData(currentBR);
    fetchTemplates();
  };

  const fetchData = async (baseBR: number) => {
    const { data } = await supabase.from('tournaments').select('*');
    if (data) {
      const chronologicalData = [...data].sort((a, b) => {
        const dateA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : new Date(a.created_at).getTime();
        const dateB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : new Date(b.created_at).getTime();
        return dateA - dateB;
      });

      let currentProfit = 0;
      let totalMyCost = 0;
      let cashed = 0;
      
      const processedChart = chronologicalData.map((t, index) => {
        const win = Number(t.winnings || 0);
        const bi = Number(t.buy_in || 0);
        const mu = Number(t.markup || 1.0);
        const sold = Number(t.max_sell_percent || 0);
        const kept = 100 - sold;

        const incomeFromSale = bi * (sold / 100) * mu;
        const myCost = bi - incomeFromSale;
        const myShareOfWin = win * (kept / 100);
        
        const net = t.is_finished ? (myShareOfWin - myCost) : 0;
        currentProfit += net;
        
        if(t.is_finished) {
            totalMyCost += myCost > 0 ? myCost : 0;
            if(win > 0) cashed++;
        }

        return { name: index + 1, bankroll: Number((baseBR + currentProfit).toFixed(2)) };
      });

      const finishedCount = chronologicalData.filter(t => t.is_finished).length;
      setStats({
        profit: currentProfit,
        roi: totalMyCost > 0 ? (currentProfit / totalMyCost) * 100 : 0,
        itm: finishedCount > 0 ? (cashed / finishedCount) * 100 : 0,
        count: finishedCount
      });
      setChartData([{ name: 0, bankroll: baseBR }, ...processedChart]);

      const sortedForList = [...chronologicalData].sort((a, b) => {
        if (a.is_finished !== b.is_finished) return a.is_finished ? 1 : -1;
        const dateA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : new Date(a.created_at).getTime();
        const dateB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : new Date(b.created_at).getTime();
        if (!a.is_finished) return dateA - dateB;
        else return dateB - dateA;
      });

      setTournaments(sortedForList);
    }
  };

  const handleEditBankroll = async () => {
    const newVal = prompt("Podaj nowy bankroll startowy (np. 337.29):", startBankroll.toString());
    if (newVal !== null && !isNaN(Number(newVal))) {
      const val = parseFloat(Number(newVal).toFixed(2));
      await supabase.from('settings').upsert({ id: 'start_bankroll', value: val });
      setStartBankroll(val);
      fetchData(val);
    }
  };

  const addTournament = async () => {
    if (!addForm.name || !addForm.buyIn) return alert("Podaj nazwę i wpisowe!");
    const { error } = await supabase.from('tournaments').insert([{ 
      name: addForm.name, buy_in: parseFloat(addForm.buyIn), markup: parseFloat(addForm.markup), 
      max_sell_percent: parseFloat(addForm.sold), scheduled_date: addForm.scheduledDate ? new Date(addForm.scheduledDate).toISOString() : null, is_finished: false 
    }]);
    if (!error) {
      setAddForm({ name: '', buyIn: '', markup: '1.0', sold: '0', scheduledDate: '' });
      fetchData(startBankroll);
    }
  };

  const handleTemplateSelect = (e: any) => {
    const val = e.target.value;
    const match = templates.find(t => t.name === val);
    if (match) {
      setAddForm({ ...addForm, name: val, buyIn: match.default_buy_in.toString() });
    } else {
      setAddForm({ ...addForm, name: val });
    }
  };

  const saveNewTemplate = async () => {
    if(!newTemplate.name) return;
    await supabase.from('tournament_templates').insert([{ name: newTemplate.name, default_buy_in: parseFloat(newTemplate.buyIn || '0') }]);
    setNewTemplate({ name: '', buyIn: '' });
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('tournament_templates').delete().eq('id', id);
    fetchTemplates();
  };

  const openEditModal = (t: any) => {
    let formattedDate = '';
    if (t.scheduled_date) {
      const dateObj = new Date(t.scheduled_date);
      dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset());
      formattedDate = dateObj.toISOString().slice(0, 16);
    }
    setEditingTourney({ id: t.id, name: t.name, buyIn: t.buy_in, markup: t.markup, sold: t.max_sell_percent, scheduledDate: formattedDate });
  };

  const updateTournament = async () => {
    const { error } = await supabase.from('tournaments').update({
      name: editingTourney.name, buy_in: parseFloat(editingTourney.buyIn), markup: parseFloat(editingTourney.markup),
      max_sell_percent: parseFloat(editingTourney.sold), scheduled_date: editingTourney.scheduledDate ? new Date(editingTourney.scheduledDate).toISOString() : null
    }).eq('id', editingTourney.id);

    if (!error) {
      setEditingTourney(null);
      fetchData(startBankroll);
    } else alert("Błąd aktualizacji: " + error.message);
  };

  const settleTournament = async (id: string) => {
    const amount = prompt("Ile ŁĄCZNIE wygrałeś w tym turnieju? (Wpisz 0 jeśli odpadłeś)");
    if (amount === null) return;
    const { error } = await supabase.from('tournaments').update({ winnings: parseFloat(amount), is_finished: true }).eq('id', id);
    if (!error) fetchData(startBankroll);
  };

  const deleteTournament = async (id: string) => {
    if (!confirm("Na pewno usunąć ten turniej z historii?")) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (!error) fetchData(startBankroll);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword(authForm);
    if (error) alert(error.message); else setIsAdmin(true);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans relative">
      
      {/* MODAL ZARZĄDZANIA SZABLONAMI */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-yellow-500 uppercase">Zarządzaj Bazą Turniejów</h3>
              <button onClick={() => setShowTemplatesModal(false)} className="text-gray-500 hover:text-white font-bold">X</button>
            </div>
            
            <div className="flex gap-2 mb-6 bg-black/50 p-3 rounded-xl border border-gray-800">
              <input type="text" placeholder="Nazwa nowego..." value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} className="flex-2 p-2 bg-transparent outline-none text-sm w-full" />
              <input type="number" placeholder="BI ($)" value={newTemplate.buyIn} onChange={e => setNewTemplate({...newTemplate, buyIn: e.target.value})} className="w-20 p-2 bg-transparent border-l border-gray-800 outline-none text-sm text-center" />
              <button onClick={saveNewTemplate} className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 rounded-lg font-bold text-xs uppercase transition">Dodaj</button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {templates.length === 0 && <p className="text-gray-600 text-sm text-center">Brak szablonów w bazie.</p>}
              {templates.map(t => (
                <div key={t.id} className="flex justify-between items-center bg-black/30 p-3 rounded-lg border border-gray-800/50">
                  <span className="text-sm font-medium">{t.name} <span className="text-gray-500 text-xs ml-2">(${t.default_buy_in})</span></span>
                  <button onClick={() => deleteTemplate(t.id)} className="text-red-500 hover:text-red-400 font-bold text-xs">Usuń</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDYCJI TURNIEJU (Aktywnego) */}
      {editingTourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-yellow-500/30 p-6 rounded-3xl w-full max-w-md shadow-2xl shadow-yellow-500/10">
            <h3 className="font-black text-xl mb-4 text-yellow-500 uppercase">Edytuj Turniej</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 ml-1">Nazwa</label>
                <input type="text" value={editingTourney.name} onChange={e => setEditingTourney({...editingTourney, name: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 text-white outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 ml-1">Buy-in ($)</label>
                  <input type="number" value={editingTourney.buyIn} onChange={e => setEditingTourney({...editingTourney, buyIn: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 text-white outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 ml-1">Markup (MU)</label>
                  <input type="number" step="0.01" value={editingTourney.markup} onChange={e => setEditingTourney({...editingTourney, markup: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 text-white outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 ml-1">Sprzedane %</label>
                <div className="flex items-center bg-black/50 border border-gray-800 rounded-xl p-1">
                  <input type="number" min="0" max="100" value={editingTourney.sold} onChange={e => setEditingTourney({...editingTourney, sold: e.target.value})} className="w-full p-2 bg-transparent outline-none font-bold text-center text-yellow-500" />
                  <span className="pr-3 font-black text-yellow-500">%</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 ml-1">Data startu</label>
                <input type="datetime-local" value={editingTourney.scheduledDate} onChange={e => setEditingTourney({...editingTourney, scheduledDate: e.target.value})} className="w-full p-3 rounded-xl bg-black/50 border border-gray-800 text-gray-300 outline-none text-sm" />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingTourney(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl uppercase transition">Anuluj</button>
                <button onClick={updateTournament} className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl uppercase transition">Zapisz</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-black text-yellow-500 tracking-tighter uppercase italic">BRTracker</h1>
            <p className="text-gray-500 text-sm">Rulezz</p>
          </div>

          {!isAdmin ? (
            <div className="flex gap-2 bg-gray-900/50 p-2 rounded-xl border border-gray-800">
              <input type="email" placeholder="Email" className="bg-transparent text-sm p-2 outline-none w-32" onChange={e => setAuthForm({...authForm, email: e.target.value})} />
              <input type="password" placeholder="Hasło" className="bg-transparent text-sm p-2 outline-none w-32" onChange={e => setAuthForm({...authForm, password: e.target.value})} />
              <button onClick={handleLogin} className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold text-xs uppercase">Zaloguj</button>
            </div>
          ) : (
            <button onClick={() => supabase.auth.signOut().then(() => location.reload())} className="text-gray-500 text-xs hover:text-white underline">Wyloguj Admina</button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatBox label="Twój Zysk Netto" value={`$${stats.profit.toFixed(2)}`} sub={`${stats.count} gier`} color={stats.profit >= 0 ? "text-green-400" : "text-red-500"} />
          <StatBox label="ROI %" value={`${stats.roi.toFixed(1)}%`} sub="Z Twojego wkładu" color="text-yellow-500" />
          <StatBox label="Skuteczność ITM" value={`${stats.itm.toFixed(1)}%`} sub="In The Money" color="text-blue-400" />
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex justify-between items-center">
                Bankroll {isAdmin && <button onClick={handleEditBankroll} className="text-yellow-500 hover:text-yellow-400 text-sm">✏️</button>}
              </p>
              <p className="text-2xl font-black text-white">${(startBankroll + stats.profit).toFixed(2)}</p>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">Start: ${startBankroll.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-[#0f0f0f] border border-gray-800 rounded-3xl p-6 mb-8 shadow-2xl">
          <h2 className="text-gray-400 text-xs font-bold uppercase mb-6 tracking-widest text-center">Wykres Twojego Bankrollu</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="name" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '10px' }} itemStyle={{ color: '#f59e0b', fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="bankroll" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">📋 Oferta & Historia</h3>
            <div className="space-y-3">
              {tournaments.map((t) => {
                const myCost = t.buy_in - (t.buy_in * (t.max_sell_percent / 100) * t.markup);
                const kept = 100 - t.max_sell_percent;
                const myWin = t.winnings * (kept / 100);
                const net = t.is_finished ? (myWin - myCost) : 0;
                const isIncoming = !t.is_finished && t.scheduled_date && new Date(t.scheduled_date) > new Date();

                return (
                  <div key={t.id} className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-2xl flex justify-between items-center hover:bg-[#151515] transition group">
                    <div>
                      {t.scheduled_date ? (
                        <span className="text-[10px] text-yellow-500 font-mono uppercase font-bold tracking-wider">
                          📅 {new Date(t.scheduled_date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-mono uppercase">{new Date(t.created_at).toLocaleDateString()}</span>
                      )}
                      
                      <h4 className="font-bold text-gray-200 mt-1">{t.name}</h4>
                      <div className="flex gap-2 text-[11px] text-gray-500 mt-1">
                        <span>BI: ${t.buy_in}</span>
                        <span>| Sprzedane: {t.max_sell_percent}% (MU: {t.markup})</span>
                        <span className="text-yellow-500 font-bold">| Dla Cb: {kept}%</span>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-3">
                      <div>
                        {t.is_finished ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-500">Twój Profit:</span>
                            <span className={`font-black ${net > 0 ? 'text-green-400' : 'text-red-500'}`}>
                              {net > 0 ? '+' : ''}${net.toFixed(2)}
                            </span>
                          </div>
                        ) : isIncoming ? (
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-lg uppercase font-bold tracking-widest">Wkrótce</span>
                        ) : (
                          <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-1 rounded-lg uppercase font-bold animate-pulse tracking-widest">W grze</span>
                        )}
                      </div>
                      
                      {isAdmin && (
                        <div className="flex gap-1 ml-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          {!t.is_finished && (
                            <>
                              <button onClick={() => settleTournament(t.id)} className="bg-white text-black text-[11px] font-bold px-2 py-1.5 rounded-lg hover:bg-gray-200 transition">Rozlicz</button>
                              <button onClick={() => openEditModal(t)} className="bg-gray-800 text-gray-300 text-[11px] px-2 py-1.5 rounded-lg hover:bg-gray-700 transition">⚙️</button>
                            </>
                          )}
                          <button onClick={() => deleteTournament(t.id)} className="bg-red-900/30 text-red-500 text-[11px] font-bold px-2 py-1.5 rounded-lg hover:bg-red-900/60 transition">X</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            {isAdmin && (
                <div className="bg-yellow-500 p-6 rounded-3xl text-black sticky top-8 shadow-2xl">
                    <h3 className="font-black text-xl mb-4 uppercase italic">Dodaj nową grę</h3>
                    <div className="space-y-3">
                        
                        {/* WYSZUKIWARKA Z SZABLONAMI */}
                        <div>
                          <div className="flex justify-between items-end mb-1">
                            <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Nazwa turnieju</label>
                            <button onClick={() => setShowTemplatesModal(true)} className="text-[10px] bg-black/10 hover:bg-black/20 text-black font-bold px-2 py-1 rounded transition">⚙️ Baza Turniejów</button>
                          </div>
                          <input 
                            type="text" 
                            list="tourney-templates"
                            placeholder="Wybierz z listy lub wpisz..." 
                            value={addForm.name} 
                            onChange={handleTemplateSelect} 
                            className="w-full p-3 rounded-xl bg-black/10 border border-black/20 placeholder:text-black/50 outline-none font-medium" 
                          />
                          <datalist id="tourney-templates">
                            {templates.map(t => <option key={t.id} value={t.name} />)}
                          </datalist>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Buy-in ($)</label>
                            <input type="number" placeholder="Np. 10.50" value={addForm.buyIn} onChange={e => setAddForm({...addForm, buyIn: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 border border-black/20 placeholder:text-black/50 outline-none font-medium" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Markup (MU)</label>
                            <input type="number" step="0.01" placeholder="Np. 1.15" value={addForm.markup} onChange={e => setAddForm({...addForm, markup: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 border border-black/20 placeholder:text-black/50 outline-none font-medium" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Zostawiasz dla sb</label>
                            <div className="flex items-center bg-black/10 border border-black/20 rounded-xl p-1">
                              <input type="number" min="0" max="100" value={100 - Number(addForm.sold)} disabled className="w-full p-2 bg-transparent text-black/50 outline-none font-bold text-center" />
                              <span className="pr-3 font-black text-black/50">%</span>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Sprzedajesz</label>
                            <div className="flex items-center bg-black border border-black/20 rounded-xl p-1 shadow-inner">
                              <input type="number" min="0" max="100" placeholder="0" value={addForm.sold} onChange={e => setAddForm({...addForm, sold: e.target.value})} className="w-full p-2 bg-transparent outline-none font-bold text-center text-yellow-500" />
                              <span className="pr-3 font-black text-yellow-500">%</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Data i start (Opcjonalnie)</label>
                          <input type="datetime-local" value={addForm.scheduledDate} onChange={e => setAddForm({...addForm, scheduledDate: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 border border-black/20 text-black outline-none font-medium text-sm" />
                        </div>

                        <button onClick={addTournament} className="w-full bg-black text-white font-bold py-4 rounded-xl uppercase tracking-tighter hover:scale-[1.02] transition mt-2 shadow-xl">
                            Wystaw do bazy
                        </button>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function StatBox({ label, value, sub, color }: any) {
  return (
    <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl shadow-xl">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-600 mt-1">{sub}</p>
    </div>
  );
}