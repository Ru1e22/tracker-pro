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
  const [chartData, setChartData] = useState<any[]>([]);
  const [stats, setStats] = useState({ profit: 0, roi: 0, itm: 0, count: 0 });
  const [startBankroll, setStartBankroll] = useState(102.76);

  // Formularze
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [addForm, setAddForm] = useState({ name: '', buyIn: '', markup: '1.0', sold: '0' });

  useEffect(() => {
    checkUser();
    loadInitialData();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAdmin(!!session);
  };

  const loadInitialData = async () => {
    let currentBR = 102.76;
    // Pobieramy bankroll startowy z bazy
    const { data: setItem } = await supabase.from('settings').select('*').eq('id', 'start_bankroll').single();
    if (setItem) {
      currentBR = Number(setItem.value);
      setStartBankroll(currentBR);
    }
    fetchData(currentBR);
  };

  const fetchData = async (baseBR: number) => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: true });
    if (data) {
      setTournaments([...data].reverse());
      
      let currentProfit = 0;
      let totalMyCost = 0;
      let cashed = 0;
      
      const processedChart = data.map((t, index) => {
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

        // Rysujemy całkowity bankroll, nie tylko profit
        return { name: index + 1, bankroll: Number((baseBR + currentProfit).toFixed(2)) };
      });

      const finishedCount = data.filter(t => t.is_finished).length;
      setStats({
        profit: currentProfit,
        roi: totalMyCost > 0 ? (currentProfit / totalMyCost) * 100 : 0,
        itm: finishedCount > 0 ? (cashed / finishedCount) * 100 : 0,
        count: finishedCount
      });
      // Punkt zerowy wykresu to nasz startowy bankroll
      setChartData([{ name: 0, bankroll: baseBR }, ...processedChart]);
    }
  };

  const handleEditBankroll = async () => {
    const newVal = prompt("Podaj nowy bankroll startowy (np. 150.50):", startBankroll.toString());
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
      name: addForm.name, buy_in: parseFloat(addForm.buyIn), markup: parseFloat(addForm.markup), max_sell_percent: parseFloat(addForm.sold), is_finished: false 
    }]);
    if (!error) {
      setAddForm({ name: '', buyIn: '', markup: '1.0', sold: '0' });
      fetchData(startBankroll);
    }
  };

  const settleTournament = async (id: string) => {
    const amount = prompt("Ile ŁĄCZNIE wygrałeś w tym turnieju? (Wpisz 0 jeśli odpadłeś)\n*System sam odliczy dolę dla inwestorów.*");
    if (amount === null) return;
    const { error } = await supabase.from('tournaments').update({ winnings: parseFloat(amount), is_finished: true }).eq('id', id);
    if (!error) fetchData(startBankroll);
  };

  const deleteTournament = async (id: string) => {
    if (!confirm("Na pewno usunąć ten turniej?")) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (!error) fetchData(startBankroll);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword(authForm);
    if (error) alert(error.message); else setIsAdmin(true);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* TOP BAR */}
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

        {/* STATS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatBox label="Twój Zysk Netto" value={`$${stats.profit.toFixed(2)}`} sub={`${stats.count} gier`} color={stats.profit >= 0 ? "text-green-400" : "text-red-500"} />
          <StatBox label="ROI %" value={`${stats.roi.toFixed(1)}%`} sub="Z Twojego wkładu" color="text-yellow-500" />
          <StatBox label="Skuteczność ITM" value={`${stats.itm.toFixed(1)}%`} sub="In The Money" color="text-blue-400" />
          
          <div className="bg-[#0f0f0f] border border-gray-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex justify-between items-center">
                Bankroll 
                {isAdmin && <button onClick={handleEditBankroll} className="text-yellow-500 hover:text-yellow-400 text-sm">✏️</button>}
              </p>
              <p className="text-2xl font-black text-white">${(startBankroll + stats.profit).toFixed(2)}</p>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">Start: ${startBankroll.toFixed(2)}</p>
          </div>
        </div>

        {/* CHART SECTION */}
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
                {/* Oś Y dostosowuje się automatycznie, żeby wykres latał góra-dół zamiast stać w miejscu */}
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '10px' }} itemStyle={{ color: '#f59e0b', fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="bankroll" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LISTA I ADMIN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">📋 Historia Turniejów</h3>
            <div className="space-y-3">
              {tournaments.map((t) => {
                const myCost = t.buy_in - (t.buy_in * (t.max_sell_percent / 100) * t.markup);
                const kept = 100 - t.max_sell_percent;
                const myWin = t.winnings * (kept / 100);
                const net = t.is_finished ? (myWin - myCost) : 0;

                return (
                  <div key={t.id} className="bg-[#0f0f0f] border border-gray-800 p-4 rounded-2xl flex justify-between items-center hover:bg-[#151515] transition">
                    <div>
                      <span className="text-[10px] text-gray-500 font-mono uppercase">{new Date(t.created_at).toLocaleDateString()}</span>
                      <h4 className="font-bold text-gray-200">{t.name}</h4>
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
                        ) : (
                          <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full uppercase font-bold animate-pulse">W grze</span>
                        )}
                      </div>
                      
                      {isAdmin && (
                        <div className="flex gap-2 ml-2">
                          {!t.is_finished && (
                            <button onClick={() => settleTournament(t.id)} className="bg-white text-black text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition">Rozlicz</button>
                          )}
                          <button onClick={() => deleteTournament(t.id)} className="bg-red-900/30 text-red-500 border border-red-900/50 hover:bg-red-900/60 text-[11px] font-bold px-2 py-1.5 rounded-lg transition">X</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SZYBKIE DODAWANIE (Tylko Admin) */}
          <div>
            {isAdmin && (
                <div className="bg-yellow-500 p-6 rounded-3xl text-black sticky top-8 shadow-2xl">
                    <h3 className="font-black text-xl mb-4 uppercase italic">Dodaj nową grę</h3>
                    <div className="space-y-3">
                        <input type="text" placeholder="Nazwa turnieju" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="w-full p-3 rounded-xl bg-black/10 border border-black/20 placeholder:text-black/50 outline-none font-medium" />
                        
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

                        <div>
                          <label className="text-[10px] font-bold uppercase text-black/60 ml-1">Ile % sprzedajesz?</label>
                          <div className="flex items-center bg-black/10 border border-black/20 rounded-xl p-1">
                            <input type="number" min="0" max="100" placeholder="0" value={addForm.sold} onChange={e => setAddForm({...addForm, sold: e.target.value})} className="w-full p-2 bg-transparent outline-none font-bold text-center" />
                            <span className="pr-3 font-black">%</span>
                          </div>
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