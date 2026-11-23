/**
 * Data saver / reduced-data mode.
 *
 *   isDataSaverOn()      – user toggled data saver (persisted in AsyncStorage `ug_data_saver`)
 *   shouldReduceData()   – data saver is on OR we are on a cellular connection
 *                          (cellular detection needs @react-native-community/netinfo or
 *                          expo-network; neither is installed today, so without them this
 *                          only reflects the toggle and `isConnectionPoor()`).
 *   setDataSaver(on)     – persist + notify subscribers
 *   subscribeDataSaver(fn)
 *   useDataSaver()       – React hook → { dataSaver, reduce, setDataSaver }
 *
 * Services use `pageSize(n)` to shrink page sizes and `shouldPrefetch()` to skip prefetching.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetState, subscribeNet } from './netStatus';

const KEY = 'ug_data_saver';
const KEY_CELL = 'ug_data_saver_cellular';

let _on = false;
let _cellularSaver = true; // reduce data automatically on cellular (when detectable)
let _loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => { try { l(); } catch {} }); }

async function load() {
  if (_loaded) return;
  _loaded = true;
  try {
    const [a, b] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(KEY_CELL)]);
    _on = a === '1';
    if (b != null) _cellularSaver = b === '1';
    emit();
  } catch {}
}
load();
subscribeNet(() => emit());

/** True when the user switched data saver on. */
export function isDataSaverOn(): boolean { return _on; }

/** True when the app should load less data (data saver, or cellular with cellular-saver enabled). */
export function shouldReduceData(): boolean {
  if (_on) return true;
  const n = getNetState();
  if (_cellularSaver && n.isCellular) return true;
  return false;
}

export function shouldPrefetch(): boolean { return !shouldReduceData(); }

/** Halve (min 6) page sizes when reducing data. */
export function pageSize(n: number): number {
  return shouldReduceData() ? Math.max(6, Math.ceil(n / 2)) : n;
}

export async function setDataSaver(on: boolean): Promise<void> {
  _on = on;
  emit();
  try { await AsyncStorage.setItem(KEY, on ? '1' : '0'); } catch {}
}

export async function setCellularDataSaver(on: boolean): Promise<void> {
  _cellularSaver = on;
  emit();
  try { await AsyncStorage.setItem(KEY_CELL, on ? '1' : '0'); } catch {}
}

export function subscribeDataSaver(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDataSaver() {
  const [, force] = useState(0);
  useEffect(() => {
    load();
    return subscribeDataSaver(() => force(x => x + 1));
  }, []);
  return {
    dataSaver: _on,
    reduce: shouldReduceData(),
    setDataSaver,
  };
}
