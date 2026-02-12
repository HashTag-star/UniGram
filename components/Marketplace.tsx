
import React from 'react';
import { Tag, Search, Filter } from 'lucide-react';
import { MarketItem } from '../types';

interface MarketplaceProps {
  items: MarketItem[];
}

export const Marketplace: React.FC<MarketplaceProps> = ({ items }) => {
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campus Market</h1>
        <div className="flex gap-2">
          <button className="p-2 bg-white/10 rounded-lg"><Filter className="w-5 h-5" /></button>
          <button className="p-2 bg-white/10 rounded-lg"><Search className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-6 no-scrollbar">
        {['All', 'Books', 'Gadgets', 'Housing', 'Notes', 'Furniture'].map(cat => (
          <button key={cat} className="px-4 py-1.5 rounded-full bg-white/10 text-sm whitespace-nowrap hover:bg-indigo-500 transition-colors">
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.id} className="bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-indigo-500/50 transition-all group">
            <div className="aspect-square relative">
              <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md flex items-center gap-1">
                <Tag className="w-3 h-3 text-indigo-400" />
                <span className="text-xs font-bold">${item.price}</span>
              </div>
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-sm line-clamp-1">{item.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                <img src={item.seller.avatar} className="w-5 h-5 rounded-full" />
                <span className="text-[10px] text-white/50">{item.seller.username}</span>
              </div>
              <button className="w-full mt-3 py-1.5 bg-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors">
                Contact Seller
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
