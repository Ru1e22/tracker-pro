'use client';
import React, { useState } from 'react';

export default function StakingCalculator({ tournamentName = "Niedzielna Sesja", buyIn = 1050, markup = 1.15, maxAvailable = 50 }) {
  const [percent, setPercent] = useState(10);
  const calculatedCost = (buyIn * (percent / 100)) * markup;

  return (
    <div className="w-full max-w-md p-6 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl text-white font-sans">
      <h2 className="text-xl font-bold text-yellow-500 mb-1">{tournamentName}</h2>
      <div className="flex justify-between text-sm text-gray-400 mb-6">
        <span>Buy-in: <strong className="text-white">${buyIn.toFixed(2)}</strong></span>
        <span>Markup: <strong className="text-white">{markup}</strong></span>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Ile procent akcji kupujesz?
        </label>
        <div className="flex items-center gap-4">
          <input 
            type="range" min="1" max={maxAvailable} value={percent} 
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded px-3 py-1">
            <input 
              type="number" value={percent} min="1" max={maxAvailable}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="w-12 bg-transparent text-right text-white font-bold focus:outline-none"
            />
            <span className="ml-1 text-gray-400">%</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Dostępne maksimum: {maxAvailable}%</p>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
        <div className="flex justify-between mb-2 text-sm text-gray-400">
          <span>Wartość bazowa:</span>
          <span>${(buyIn * (percent / 100)).toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-gray-600 pt-3 mt-3">
          <span className="font-semibold text-gray-300">Do zapłaty:</span>
          <span className="text-2xl font-black text-green-400">${calculatedCost.toFixed(2)}</span>
        </div>
      </div>

      <button className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors duration-200">
        Potwierdź Inwestycję
      </button>
    </div>
  );
}