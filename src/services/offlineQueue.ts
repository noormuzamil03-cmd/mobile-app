import { essApi } from './api';
import type { QueuedOfflinePunch } from '../types';

const DB_NAME = 'workpulse_ess_offline_db';
const STORE_NAME = 'pending_punches';
const DB_VERSION = 1;

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflinePunch(punch: QueuedOfflinePunch): Promise<void> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(punch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedPunches(employeeId?: string): Promise<QueuedOfflinePunch[]> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = (req.result as QueuedOfflinePunch[]) || [];
      const filtered = employeeId ? all.filter((p) => p.employee === employeeId) : all;
      filtered.sort((a, b) => a.createdAt - b.createdAt);
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedPunch(id: string): Promise<void> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncOfflinePunches(employeeId: string): Promise<{
  syncedCount: number;
  failedCount: number;
  errors: string[];
}> {
  const queued = await getQueuedPunches(employeeId);
  let syncedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const item of queued) {
    try {
      await essApi.createCheckin({
        log_type: item.log_type,
        time: item.time,
        device_id: 'Mobile App',
        latitude: item.latitude,
        longitude: item.longitude,
        selfieDataUrl: item.selfieDataUrl,
        faceVerified: item.faceVerified,
        faceScore: item.faceScore,
        livenessVerified: item.livenessVerified,
        syncedFromOffline: true,
      });
      await removeQueuedPunch(item.id);
      syncedCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      // If server rejects with duplicate/geofence business rule, drop from queue or surface error
      if (msg.includes('Duplicate punch') || msg.includes('geofence')) {
        await removeQueuedPunch(item.id);
      }
      failedCount += 1;
      errors.push(msg);
    }
  }

  return { syncedCount, failedCount, errors };
}
