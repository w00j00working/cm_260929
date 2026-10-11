'use client';
// 백엔드 진입점 (v2.0) — 런타임 설정을 보고 Firebase 백엔드를 만든다 (v2.1.1부터 Firebase만).
// 설정이 없으면 null = 로컬 모드(브라우저 저장, 개발·오프라인용).
import type { Backend, BackendConfig } from './types';
import { loadServerConfig } from '../serverConfig';

let current: Backend | null = null;
let ready = false;

export async function createBackend(cfg: BackendConfig): Promise<Backend> {
  const { createFirebaseBackend } = await import('./firebaseBackend');
  return createFirebaseBackend(cfg);
}

/** 앱 시작 시 1회 — 확정된 설정으로 백엔드를 만든다 */
export async function initBackend(cfg: BackendConfig | null): Promise<Backend | null> {
  current = cfg ? await createBackend(cfg) : null;
  ready = true;
  return current;
}

/** 부팅 — 런타임 설정(ohome.config.json → localStorage → env)을 읽어 백엔드를 확정한다 */
export async function bootBackend(): Promise<Backend | null> {
  return initBackend(await loadServerConfig());
}

export function backend(): Backend | null { return current; }
export function backendReady(): boolean { return ready; }
export function isServerMode(): boolean { return ready && current !== null; }

export * from './types';
